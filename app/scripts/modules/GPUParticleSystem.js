/*
 * GPU Particle System
 * @author flimshaw - Charlie Hoey - http://charliehoey.com
 *
 * A simple to use, general purpose GPU system.  Particles are spawn-and-forget with
 * several options available, and do not require monitoring or cleanup after spawning.
 * Because the paths of all particles are completely deterministic once spawned, the scale
 * and direction of time is also variable.
 *
 * Currently uses a static wrapping perlin noise texture for turbulence, and a small png texture for
 * particles, but adding support for a particle texture atlas or changing to a different type of turbulence
 * would be a fairly light day's work.
 *
 * Shader and javascript packing code derrived from several Stack Overflow examples.
 *
 */
let glslify = require('glslify');

THREE.GPUParticleSystem = function(options) {

  var self = this;
  var options = options || {};

  // parse options and use defaults
  self.PARTICLE_COUNT = options.maxParticles || 1000000;
  self.PARTICLE_CONTAINERS = options.containerCount || 1;
  self.PARTICLES_PER_CONTAINER = Math.ceil(self.PARTICLE_COUNT / self.PARTICLE_CONTAINERS);
  self.PARTICLE_CURSOR = 0;
  self.time = 0;



  self.fragment = glslify('../../fragment-shaders/gpu-particules.frag');
  self.vertex   = glslify('../../vertex-shaders/gpu-particules.vert');


  // Custom vertex and fragement shader
  var GPUParticleShader = {
    vertexShader: self.vertex,
    fragmentShader: self.fragment
  };

  // preload a million random numbers
  self.rand = [];

  for (var i = 1e5; i > 0; i--) {
    self.rand.push(Math.random() - .5);
  }

  self.random = function() {
    return ++i >= self.rand.length ? self.rand[i = 1] : self.rand[i];
  }

  self.particleNoiseTex = THREE.ImageUtils.loadTexture("img/perlin-512.png");
  // self.particleNoiseTex = THREE.ImageUtils.loadTexture("img/black.png");
  self.particleNoiseTex.wrapS = self.particleNoiseTex.wrapT = THREE.RepeatWrapping;

  self.particleSpriteTex = THREE.ImageUtils.loadTexture("img/particle2.png");
  self.particleSpriteTex.wrapS = self.particleSpriteTex.wrapT = THREE.RepeatWrapping;

  self.particleShaderMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      "uTime": {
        type: "f",
        value: 0.0
      },
      "uScale": {
        type: "f",
        value: 1.0
      },
      "tNoise": {
        type: "t",
        value: self.particleNoiseTex
      },
      "tSprite": {
        type: "t",
        value: self.particleSpriteTex
      }
    },
    blending: THREE.AdditiveBlending,
    vertexShader: GPUParticleShader.vertexShader,
    fragmentShader: GPUParticleShader.fragmentShader
  });

  // define defaults for all values
  self.particleShaderMat.defaultAttributeValues.particlePositionsStartTime = [0, 0, 0, 0];
  self.particleShaderMat.defaultAttributeValues.particleVelColSizeLife = [0, 0, 0, 0];

  self.particleContainers = [];


  // extend Object3D
  THREE.Object3D.apply(this, arguments);

  this.init = function() {

    for (var i = 0; i < self.PARTICLE_CONTAINERS; i++) {

      var c = new THREE.GPUParticleContainer(self.PARTICLES_PER_CONTAINER, self);
      self.particleContainers.push(c);
      self.add(c);

    }

  }

  this.spawnParticle = function(options) {

    self.PARTICLE_CURSOR++;
    if (self.PARTICLE_CURSOR >= self.PARTICLE_COUNT) {
      self.PARTICLE_CURSOR = 1;
    }

    var currentContainer = self.particleContainers[Math.floor(self.PARTICLE_CURSOR / self.PARTICLES_PER_CONTAINER)];

    currentContainer.spawnParticle(options);

  }

  this.update = function(time) {
    for (var i = 0; i < self.PARTICLE_CONTAINERS; i++) {

      self.particleContainers[i].update(time);

    }
  };

  this.init();

}

THREE.GPUParticleSystem.prototype = Object.create(THREE.Object3D.prototype);
THREE.GPUParticleSystem.prototype.constructor = THREE.GPUParticleSystem;


// Subclass for particle containers, allows for very large arrays to be spread out
THREE.GPUParticleContainer = function(maxParticles, particleSystem) {

  var self = this;
  self.PARTICLE_COUNT = maxParticles || 100000;
  self.PARTICLE_CURSOR = 0;
  self.time = 0;
  self.DPR = window.devicePixelRatio;
  self.GPUParticleSystem = particleSystem;

  var particlesPerArray = Math.floor(self.PARTICLE_COUNT / self.MAX_ATTRIBUTES);

  // extend Object3D
  THREE.Object3D.apply(this, arguments);

  // construct a couple small arrays used for packing variables into floats etc
  var UINT8_VIEW = new Uint8Array(4)
  var FLOAT_VIEW = new Float32Array(UINT8_VIEW.buffer)

  function decodeFloat(x, y, z, w) {
    UINT8_VIEW[0] = Math.floor(w)
    UINT8_VIEW[1] = Math.floor(z)
    UINT8_VIEW[2] = Math.floor(y)
    UINT8_VIEW[3] = Math.floor(x)
    return FLOAT_VIEW[0]
  }

  function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }

  function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
  }

  function hexToRgb(hex) {
    var r = hex >> 16;
    var g = (hex & 0x00FF00) >> 8;
    var b = hex & 0x0000FF;

    if (r > 0) r--;
    if (g > 0) g--;
    if (b > 0) b--;

    return [r, g, b];
  };

  self.particles = [];
  self.deadParticles = [];
  self.particlesAvailableSlot = [];

  // create a container for particles
  self.particleUpdate = false;

  // Shader Based Particle System
  self.particleShaderGeo = new THREE.BufferGeometry();

  // new hyper compressed attributes
  self.particleVertices = new Float32Array(self.PARTICLE_COUNT * 3); // position
  self.particlePositionsStartTime = new Float32Array(self.PARTICLE_COUNT * 4); // position
  self.particleVelColSizeLife = new Float32Array(self.PARTICLE_COUNT * 4);

  for (var i = 0; i < self.PARTICLE_COUNT; i++) {
    self.particlePositionsStartTime[i * 4 + 0] = 100; //x
    self.particlePositionsStartTime[i * 4 + 1] = 0; //y
    self.particlePositionsStartTime[i * 4 + 2] = 0.0; //z
    self.particlePositionsStartTime[i * 4 + 3] = 0.0; //startTime

    self.particleVertices[i * 3 + 0] = 0; //x
    self.particleVertices[i * 3 + 1] = 0; //y
    self.particleVertices[i * 3 + 2] = 0.0; //z

    self.particleVelColSizeLife[i * 4 + 0] = decodeFloat(128, 128, 0, 0); //vel
    self.particleVelColSizeLife[i * 4 + 1] = decodeFloat(0, 254, 0, 254); //color
    self.particleVelColSizeLife[i * 4 + 2] = 1.0; //size
    self.particleVelColSizeLife[i * 4 + 3] = 0.0; //lifespan
  }

  self.particleShaderGeo.addAttribute('position', new THREE.BufferAttribute(self.particleVertices, 3));
  self.particleShaderGeo.addAttribute('particlePositionsStartTime', new THREE.BufferAttribute(self.particlePositionsStartTime, 4).setDynamic(true));
  self.particleShaderGeo.addAttribute('particleVelColSizeLife', new THREE.BufferAttribute(self.particleVelColSizeLife, 4).setDynamic(true));

  self.posStart = self.particleShaderGeo.getAttribute('particlePositionsStartTime')
  self.velCol = self.particleShaderGeo.getAttribute('particleVelColSizeLife');

  self.particleShaderMat = self.GPUParticleSystem.particleShaderMat;

  this.init = function() {
    self.particleSystem = new THREE.Points(self.particleShaderGeo, self.particleShaderMat);
    self.particleSystem.frustumCulled = false;
    this.add(self.particleSystem);
  };

  var options = {},
    position = new THREE.Vector3(),
    velocity = new THREE.Vector3(),
    positionRandomness = 0.,
    velocityRandomness = 0.,
    color = 0xffffff,
    colorRandomness = 0.,
    turbulence = 0.,
    lifetime = 0.,
    size = 0.,
    sizeRandomness = 0.,
    smoothPosition = false
    i;

  var maxVel = 2;
  var maxSource = 250;
  this.offset = 0;
  this.count = 0;

  this.spawnParticle = function(options) {

    options = options || {};

    // setup reasonable default values for all arguments
    position = options.position !== undefined ? position.copy(options.position) : position.set(0., 0., 0.);
    velocity = options.velocity !== undefined ? velocity.copy(options.velocity) : velocity.set(0., 0., 0.);
    positionRandomness = options.positionRandomness !== undefined ? options.positionRandomness : 0.0;
    velocityRandomness = options.velocityRandomness !== undefined ? options.velocityRandomness : 0.0;
    color = options.color !== undefined ? options.color : 0xffffff;
    colorRandomness = options.colorRandomness !== undefined ? options.colorRandomness : 1.0;
    turbulence = options.turbulence !== undefined ? options.turbulence : 1.0;
    lifetime = options.lifetime !== undefined ? options.lifetime : 5.0;
    size = options.size !== undefined ? options.size : 10;
    sizeRandomness = options.sizeRandomness !== undefined ? options.sizeRandomness : 0.0,
      smoothPosition = options.smoothPosition !== undefined ? options.smoothPosition : false;

    if (self.DPR !== undefined) size *= self.DPR;

    i = self.PARTICLE_CURSOR;

    self.posStart.array[i * 4 + 0] = position.x + ((particleSystem.random()) * positionRandomness); // - ( velocity.x * particleSystem.random() ); //x
    self.posStart.array[i * 4 + 1] = position.y + ((particleSystem.random()) * positionRandomness); // - ( velocity.y * particleSystem.random() ); //y
    self.posStart.array[i * 4 + 2] = position.z + ((particleSystem.random()) * positionRandomness); // - ( velocity.z * particleSystem.random() ); //z
    self.posStart.array[i * 4 + 3] = self.time + (particleSystem.random() * 2e-2); //startTime

    if (smoothPosition === true) {
      self.posStart.array[i * 4 + 0] += -(velocity.x * particleSystem.random()); //x
      self.posStart.array[i * 4 + 1] += -(velocity.y * particleSystem.random()); //y
      self.posStart.array[i * 4 + 2] += -(velocity.z * particleSystem.random()); //z
    }

    var velX = velocity.x + (particleSystem.random()) * velocityRandomness;
    var velY = velocity.y + (particleSystem.random()) * velocityRandomness;
    var velZ = velocity.z + (particleSystem.random()) * velocityRandomness;

    // convert turbulence rating to something we can pack into a vec4
    var turbulence = Math.floor(turbulence * 254);

    // clamp our value to between 0. and 1.
    velX = Math.floor(maxSource * ((velX - -maxVel) / (maxVel - -maxVel)));
    velY = Math.floor(maxSource * ((velY - -maxVel) / (maxVel - -maxVel)));
    velZ = Math.floor(maxSource * ((velZ - -maxVel) / (maxVel - -maxVel)));

    self.velCol.array[i * 4 + 0] = decodeFloat(velX, velY, velZ, turbulence); //vel

    var rgb = hexToRgb(color);

    for (var c = 0; c < rgb.length; c++) {
      rgb[c] = Math.floor(rgb[c] + ((particleSystem.random()) * colorRandomness) * 254);
      if (rgb[c] > 254) rgb[c] = 254;
      if (rgb[c] < 0) rgb[c] = 0;
    }

    self.velCol.array[i * 4 + 1] = decodeFloat(rgb[0], rgb[1], rgb[2], 254); //color
    self.velCol.array[i * 4 + 2] = size + (particleSystem.random()) * sizeRandomness; //size
    self.velCol.array[i * 4 + 3] = lifetime; //lifespan

    if (this.offset == 0) {
      this.offset = self.PARTICLE_CURSOR;
    }

    self.count++;

    self.PARTICLE_CURSOR++;

    if (self.PARTICLE_CURSOR >= self.PARTICLE_COUNT) {
      self.PARTICLE_CURSOR = 0;
    }

    self.particleUpdate = true;

  }

  this.update = function(time) {

    self.time = time;
    self.particleShaderMat.uniforms['uTime'].value = time;

    this.geometryUpdate();

  };

  this.geometryUpdate = function() {
    if (self.particleUpdate == true) {
      self.particleUpdate = false;

      // if we can get away with a partial buffer update, do so
      if (self.offset + self.count < self.PARTICLE_COUNT) {
        self.posStart.updateRange.offset = self.velCol.updateRange.offset = self.offset * 4;
        self.posStart.updateRange.count = self.velCol.updateRange.count = self.count * 4;
      } else {
        self.posStart.updateRange.offset = 0;
        self.posStart.updateRange.count = self.velCol.updateRange.count = (self.PARTICLE_COUNT * 4);
      }

      self.posStart.needsUpdate = true;
      self.velCol.needsUpdate = true;

      self.offset = 0;
      self.count = 0;
    }
  }

  this.init();

}

THREE.GPUParticleContainer.prototype = Object.create(THREE.Object3D.prototype);
THREE.GPUParticleContainer.prototype.constructor = THREE.GPUParticleContainer;
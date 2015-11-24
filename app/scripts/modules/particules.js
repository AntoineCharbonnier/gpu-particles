import { GPUParticleSystem } from './GPUParticleSystem';

class Particules {

    constructor() {

        this.particleSystem = new THREE.GPUParticleSystem({
            maxParticles: 250000
        });
        
        this.gui = new dat.GUI()

        // options passed during each spawned
        this.options = {
            position: new THREE.Vector3(),
            positionRandomness: .3,
            velocity: new THREE.Vector3(),
            velocityRandomness: .5,
            color: 0xaa88ff,
            colorRandomness: .2,
            turbulence: .5,
            lifetime: 2,
            size: 5,
            sizeRandomness: 1
        };

        this.spawnerOptions = {
            spawnRate: 15000,
            horizontalSpeed: 1.5,
            verticalSpeed: 1.33,
            timeScale: 1
        }

        this.clock = new THREE.Clock(true)
        this.tick = 0

        this.gui.add(this.options, "velocityRandomness", 0, 3);
        this.gui.add(this.options, "positionRandomness", 0, 3);
        this.gui.add(this.options, "size", 1, 20);
        this.gui.add(this.options, "sizeRandomness", 0, 25);
        this.gui.add(this.options, "colorRandomness", 0, 1);
        this.gui.add(this.options, "lifetime", .1, 10);
        this.gui.add(this.options, "turbulence", 0, 1);

        this.gui.add(this.spawnerOptions, "spawnRate", 10, 30000);
        this.gui.add(this.spawnerOptions, "timeScale", -1, 1);

    }

    addToTheScene(scene){
        scene.add( this.particleSystem);
    }

    removeToTheScene(scene){
        scene.remove( this.particleSystem);
    }

    update( ts ) {

      var delta = this.clock.getDelta() * this.spawnerOptions.timeScale;
      this.tick += delta;

      if (this.tick < 0) this.tick = 0;

      if (delta > 0) {
        this.options.position.x = Math.sin(this.tick * this.spawnerOptions.horizontalSpeed) * 20;
        this.options.position.y = Math.sin(this.tick * this.spawnerOptions.verticalSpeed) * 10;
        this.options.position.z = Math.sin(this.tick * this.spawnerOptions.horizontalSpeed + this.spawnerOptions.verticalSpeed) * 5;

        for (var x = 0; x < this.spawnerOptions.spawnRate * delta; x++) {
          // Yep, that's really it.  Spawning particles is super cheap, and once you spawn them, the rest of
          // their lifecycle is handled entirely on the GPU, driven by a time uniform updated below
          this.particleSystem.spawnParticle(this.options);
        }
      }

      this.particleSystem.update(this.tick);



    }

}

export { Particules };
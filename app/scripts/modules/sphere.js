let glslify = require('glslify');


class Sphere {

    constructor() {

        this.basicColorSphereFrag = glslify('../../fragment-shaders/basicColorSphereFrag.frag');
        this.ashimaVert           = glslify('../../vertex-shaders/ashima.vert');
        
        this.meshMaterial         = new THREE.ShaderMaterial( {

            uniforms: { 
                time: { type: "f", value: 0 },
                weight: { type: "f", value: 0 },
                amplitude: {
                    type: 'f',
                    value: 0
                },
                size: { type: 'f', value: 1024 },
                opacity: { type: 'f', value: 1.0 } 
            },
            
            vertexShader: this.ashimaVert,
            fragmentShader: this.basicColorSphereFrag,
            shading: THREE.SmoothShading,
            wireframe: false
            
        } );
    
        this.meshGeometry    = new THREE.DodecahedronGeometry( 20, 6 );
        this.mesh            = new THREE.Mesh( this.meshGeometry, this.meshMaterial );
        this.mesh.position.z = -150;

        this.clock  = Date.now();
        this.speed  = .0003;
        this.weight = 2.5;

        this.update();

        return this.mesh;

    }

    update( ts ) {

        window.requestAnimationFrame( this.update.bind(this) );

        this.meshMaterial.uniforms[ 'time' ].value = this.speed * ( Date.now() - this.clock );
        
        this.meshMaterial.uniforms[ 'weight' ].value = this.weight;

        this.meshMaterial.uniforms.amplitude.value = Math.sin( ts );

    }

    setWeight( _weight ) {

        this.weight = _weight;

    }

}

export { Sphere };
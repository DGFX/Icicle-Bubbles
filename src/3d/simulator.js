var settings = require('../core/settings');
var THREE = require('three');

var undef;

var glslify = require('glslify');
var shaderParse = require('../helpers/shaderParse');

var _copyShader;
var _positionShader;
var _textureDefaultPosition;
var _positionRenderTarget;
var _positionRenderTarget2;

var _renderer;
var _mesh;
var _scene;
var _camera;

var TEXTURE_WIDTH;
var TEXTURE_HEIGHT;
var AMOUNT;

exports.init = init;
exports.update = update;
exports.positionRenderTarget = undef;
exports.prevPositionRenderTarget = undef;
exports.initAnimation = 0;

function init(renderer) {

    TEXTURE_WIDTH = exports.TEXTURE_WIDTH = settings.simulatorTextureWidth;
    TEXTURE_HEIGHT = exports.TEXTURE_HEIGHT = settings.simulatorTextureHeight;
    AMOUNT = exports.AMOUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

    _renderer = renderer;

    var rawShaderPrefix = 'precision ' + renderer.capabilities.precision + ' float;\n';

    _scene = new THREE.Scene();
    _camera = new THREE.Camera();
    _camera.position.z = 1;

    _copyShader = new THREE.RawShaderMaterial({
        uniforms: {
            resolution: { type: 'v2', value: new THREE.Vector2(TEXTURE_WIDTH, TEXTURE_HEIGHT) },
            texture: { type: 't', value: undef }
        },
        vertexShader: rawShaderPrefix + shaderParse(glslify('../glsl/quad.vert')),
        fragmentShader: rawShaderPrefix + shaderParse(glslify('../glsl/through.frag'))
    });

    _positionShader = new THREE.RawShaderMaterial({
        uniforms: {
            resolution: { type: 'v2', value: new THREE.Vector2(TEXTURE_WIDTH, TEXTURE_HEIGHT) },
            texturePosition: { type: 't', value: undef },
            textureDefaultPosition: { type: 't', value: undef },
            mouse3d: { type: 'v3', value: new THREE.Vector3() },
            speed: { type: 'f', value: 0 },
            dieSpeed: { type: 'f', value: 0 },
            deltaDistance: { type: 'f', value: 0 },
            radius: { type: 'f', value: 0 },
            attraction: { type: 'f', value: 0 },
            time: { type: 'f', value: 0 },
            initAnimation: { type: 'f', value: 0 },
            curlSize: { type: 'f', value: 0.015 }
        },
        vertexShader: rawShaderPrefix + shaderParse(glslify('../glsl/quad.vert')),
        fragmentShader: rawShaderPrefix + shaderParse(glslify('../glsl/position.frag')),
        blending: THREE.NoBlending,
        transparent: false,
        depthWrite: false,
        depthTest: false
    });

    _mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), _copyShader);
    _scene.add(_mesh);

    _positionRenderTarget = new THREE.WebGLRenderTarget(TEXTURE_WIDTH, TEXTURE_HEIGHT, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        depthWrite: false,
        depthBuffer: false,
        stencilBuffer: false
    });
    _positionRenderTarget2 = _positionRenderTarget.clone();
    _copyTexture(_createPositionTexture(), _positionRenderTarget);
    _copyTexture(_positionRenderTarget, _positionRenderTarget2);

}

function _copyTexture(input, output) {
    _mesh.material = _copyShader;
    _copyShader.uniforms.texture.value = input;
    _renderer.render(_scene, _camera, output);
}

function _updatePosition(dt) {

    // swap
    var tmp = _positionRenderTarget;
    _positionRenderTarget = _positionRenderTarget2;
    _positionRenderTarget2 = tmp;

    _mesh.material = _positionShader;
    _positionShader.uniforms.textureDefaultPosition.value = _textureDefaultPosition;
    _positionShader.uniforms.texturePosition.value = _positionRenderTarget2;
    _positionShader.uniforms.deltaDistance.value = settings.deltaDistance;
    _positionShader.uniforms.time.value += dt * 0.001;
    _renderer.render(_scene, _camera, _positionRenderTarget);
}

function _createPositionTexture() {
    var positions = new Float32Array(AMOUNT * 4);
    var i4;
    var r, phi, theta;
    for (var i = 0; i < AMOUNT; i++) {
        i4 = i * 4;
        r = (0.5 + Math.random() * 0.5) * 75;
        phi = (Math.random() - 0.5) * Math.PI;
        theta = Math.random() * Math.PI * 2;
        positions[i4 + 0] = r * Math.cos(theta) * Math.cos(phi);
        positions[i4 + 1] = r * Math.sin(phi);
        positions[i4 + 2] = r * Math.sin(theta) * Math.cos(phi);
        positions[i4 + 3] = Math.random();
    }
    var texture = new THREE.DataTexture(positions, TEXTURE_WIDTH, TEXTURE_HEIGHT, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.flipY = false;
    _textureDefaultPosition = texture;
    return texture;
}

function update(dt) {

    var deltaRatio = dt / 16.6667;

    dt = dt * settings.speed;

    if (settings.speed || settings.dieSpeed) {

        var autoClearColor = _renderer.autoClearColor;
        var clearColor = _renderer.getClearColor().getHex();
        var clearAlpha = _renderer.getClearAlpha();

        _renderer.autoClearColor = false;

        _positionShader.uniforms.curlSize.value = settings.curlSize;
        _positionShader.uniforms.dieSpeed.value = settings.dieSpeed * deltaRatio;
        _positionShader.uniforms.radius.value = settings.radius;
        _positionShader.uniforms.attraction.value = settings.attraction * settings.speed * deltaRatio;
        _positionShader.uniforms.speed.value = settings.speed * deltaRatio;

        _positionShader.uniforms.mouse3d.value.copy(settings.mouse3d);
        _updatePosition(dt);

        _renderer.setClearColor(clearColor, clearAlpha);
        _renderer.autoClearColor = autoClearColor;
        exports.positionRenderTarget = _positionRenderTarget;
        exports.prevPositionRenderTarget = _positionRenderTarget2;

    }

}



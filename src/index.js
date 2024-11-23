var quickLoader = require('quick-loader');
var dat = require('dat-gui');
var Stats = require('stats.js');
var css = require('dom-css');
var raf = require('raf');

var THREE = require('three');

var OrbitControls = require('./controls/OrbitControls');
var settings = require('./core/settings');

var math = require('./utils/math');
var mobile = require('./fallback/mobile');
var encode = require('mout/queryString/encode');

var fboHelper = require('./3d/fboHelper');
var simulator = require('./3d/simulator');
var particles = require('./3d/particles');

var postprocessing = require('./3d/postprocessing/postprocessing');
var dof = require('./3d/postprocessing/dof/dof');
var vignette = require('./3d/postprocessing/vignette/vignette');
var motionBlur = require('./3d/postprocessing/motionBlur/motionBlur');
var fxaa = require('./3d/postprocessing/fxaa/fxaa');
var vignette = require('./3d/postprocessing/vignette/vignette');
var bloom = require('./3d/postprocessing/bloom/bloom');


var _gui;
var _stats;

var _width = 0;
var _height = 0;

var _control;
var _camera;
var _scene;
var _renderer;

var _bgColor;

var _time = 0;
var _ray = new THREE.Ray();

var _initAnimation = 0;
var _isSkipRendering = false;

var _instruction;

function init() {

    if (settings.useStats) {
        _stats = new Stats();
        css(_stats.domElement, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            zIndex: 2048
        });

        document.body.appendChild(_stats.domElement);
    }


    _bgColor = new THREE.Color(settings.bgColor);
    settings.mouseX = 0;
    settings.mouseY = 0;
    settings.prevMouseX = 0;
    settings.prevMouseY = 0;
    settings.mouse = new THREE.Vector2(0, 0);
    settings.mouse3d = _ray.origin;

    _renderer = new THREE.WebGLRenderer({
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
    });
    fboHelper.init(_renderer);

    _renderer.setClearColor(settings.bgColor);
    document.body.appendChild(_renderer.domElement);

    if (mobile.isMobile) {
        settings.simulatorTextureWidth = 32;
        settings.simulatorTextureHeight = 32;
        settings.particleSize = 16;
        settings.vignetteMultiplier = 0.5;
        settings.fxaa = false;
    }

    _scene = new THREE.Scene();
    _camera = settings.camera = new THREE.PerspectiveCamera(45, 1, 10, 5000);
    _camera.position.set(300, 60, 300).normalize().multiplyScalar(500);
    settings.cameraPosition = _camera.position;

    simulator.init(_renderer);
    particles.init(_renderer, _camera);

    postprocessing.init(_renderer, _scene, _camera);

    _control = new OrbitControls(_camera, _renderer.domElement);
    _control.maxDistance = 650;
    _control.minPolarAngle = 0.3;
    _control.maxPolarAngle = Math.PI / 2 - 0.1;
    _control.noPan = true;
    _control.update();

    /**
     * GUI
     */
    _gui = new dat.GUI();
    var simulatorGui = _gui.addFolder('Simulator');
    simulatorGui.add(settings.query, 'amount', settings.amountList).onChange(function () {
        if (confirm('It will restart the demo')) {
            window.location.href = window.location.href.split('#')[0] + encode(settings.query).replace('?', '#');
            window.location.reload();
        }
    });
    simulatorGui.add(settings, 'speed', 0, 2).listen();
    simulatorGui.add(settings, 'dieSpeed', 0, 0.05).listen();
    simulatorGui.add(settings, 'radius', 0.1, 4).listen();
    simulatorGui.add(settings, 'curlSize', 0.001, 0.05).listen();
    simulatorGui.add(settings, 'attraction', -2, 2).listen();
    simulatorGui.add({ toggleMovement: _toggleMovement }, 'toggleMovement');

    var renderingGui = _gui.addFolder('Rendering');
    renderingGui.add(settings, 'matcap', ['default', 'plastic', 'metal']);
    renderingGui.add(settings, 'particleSize', 16, 48).name('particle size');
    renderingGui.add(settings, 'inset', 0, 3, 0.0001).listen();
    renderingGui.add(settings, 'washout', 0, 1, 0.0001).step(0.001).listen();
    renderingGui.add(settings, 'brightness', 0, 1, 0.0001).step(0.001).listen();
    var blurControl = renderingGui.add(settings, 'blur', 0, 3, 0.0001).listen();
    var blurZControl = renderingGui.add(settings, 'blurZ', 0, 1, 0.0001).step(0.001).listen();
    blurControl.onChange(enableGuiControl.bind(this, blurZControl));
    enableGuiControl(blurZControl, settings.blur);
    renderingGui.addColor(settings, 'bgColor').listen();


    /**
     * Post-Processing
     */
    // var postprocessingGui = _gui.addFolder('Post-Processing');

    // var dofControl = postprocessingGui.add(settings, 'dof', 0, 3, 0.0001).listen();
    // var dofMouseControl = postprocessingGui.add(settings, 'dofMouse').name('dof on mouse').listen();
    // dofControl.onChange(enableGuiControl.bind(this, dofMouseControl));
    // enableGuiControl(dofMouseControl, settings.dof);
    // postprocessingGui.add(settings, 'fxaa').listen();

    // motionBlur.maxDistance = 120;
    // motionBlur.motionMultiplier = 2;
    // motionBlur.linesRenderTargetScale = settings.motionBlurQualityMap[settings.query.motionBlurQuality];
    // var motionBlurControl = postprocessingGui.add(settings, 'motionBlur');
    // var motionMaxDistance = postprocessingGui.add(motionBlur, 'maxDistance', 1, 300).name('motion distance').listen();
    // var motionMultiplier = postprocessingGui.add(motionBlur, 'motionMultiplier', 0.1, 15).name('motion multiplier').listen();
    // var motionQuality = postprocessingGui.add(settings.query, 'motionBlurQuality', settings.motionBlurQualityList).name('motion quality').onChange(function (val) {
    //     motionBlur.linesRenderTargetScale = settings.motionBlurQualityMap[val];
    //     motionBlur.resize();
    // });
    // var controlList = [motionMaxDistance, motionMultiplier, motionQuality];
    // motionBlurControl.onChange(enableGuiControl.bind(this, controlList));
    // enableGuiControl(controlList, settings.motionBlur);

    // var bloomControl = postprocessingGui.add(settings, 'bloom');
    // var bloomRadiusControl = postprocessingGui.add(bloom, 'blurRadius', 0, 3).name('bloom radius');
    // var bloomAmountControl = postprocessingGui.add(bloom, 'amount', 0, 3).name('bloom amount');
    // controlList = [bloomRadiusControl, bloomAmountControl];
    // bloomControl.onChange(enableGuiControl.bind(this, controlList));
    // enableGuiControl(controlList, settings.bloom);

    // postprocessingGui.add(settings, 'vignette');

    // postprocessingGui.open();

    function enableGuiControl(controls, flag) {
        controls = controls.length ? controls : [controls];
        var control;
        for (var i = 0, len = controls.length; i < len; i++) {
            control = controls[i];
            control.__li.style.pointerEvents = flag ? 'auto' : 'none';
            control.domElement.parentNode.style.opacity = flag ? 1 : 0.1;
        }
    }

    var preventDefault = function (evt) { evt.preventDefault(); this.blur(); };
    Array.prototype.forEach.call(_gui.domElement.querySelectorAll('input[type="checkbox"],select'), function (elem) {
        elem.onkeyup = elem.onkeydown = preventDefault;
        elem.style.color = '#000';
    });

    if (!settings.isMobile) {
        simulatorGui.open();
        renderingGui.open();
    }

    _gui.close();

    if (mobile.isMobile) {
        _instruction.style.visibility = 'hidden';
    }

    _gui.domElement.addEventListener('mousedown', _stopPropagation);
    _gui.domElement.addEventListener('touchstart', _stopPropagation);

    window.addEventListener('resize', _onResize);
    window.addEventListener('mousemove', _onMove);
    window.addEventListener('touchmove', _bindTouch(_onMove));
    window.addEventListener('keyup', _onKeyUp);

    settings.deltaDistance = 1;
    settings.prevMouse = new THREE.Vector2(0, 0);
    _time = Date.now();
    _onResize();
    _loop();

}

function _stopPropagation(evt) {
    evt.stopPropagation();
}

function _bindTouch(func) {
    return function (evt) {
        func(evt.changedTouches[0]);
    };
}

function _onMove(evt) {
    settings.mouseX = evt.clientX;
    settings.mouseY = evt.clientY;
    settings.mouse.x = (settings.mouseX / _width) * 2 - 1;
    settings.mouse.y = -(settings.mouseY / _height) * 2 + 1;
}

function _onKeyUp(evt) {
    if (evt.keyCode === 32) {
        _toggleMovement();
    }
}

function _toggleMovement() {
    settings.speed = settings.speed === 0 ? 1 : 0;
    settings.dieSpeed = settings.dieSpeed === 0 ? 0.015 : 0;
}

function _onResize() {
    _width = window.innerWidth;
    _height = window.innerHeight;

    particles.resize(_width, _height);
    postprocessing.resize(_width, _height);

    _camera.aspect = _width / _height;
    _camera.updateProjectionMatrix();
    _renderer.setSize(_width, _height);

}

function _loop() {
    var newTime = Date.now();
    raf(_loop);
    if (settings.useStats) _stats.begin();
    if (!_isSkipRendering) _render(newTime - _time, newTime);
    if (settings.useStats) _stats.end();
    _time = newTime;
}

function _render(dt, newTime) {

    motionBlur.skipMatrixUpdate = !(settings.dieSpeed || settings.speed) && settings.motionBlurPause;

    _bgColor.setStyle(settings.bgColor);
    var tmpColor = new THREE.Color(settings.bgColor);
    tmpColor.lerp(_bgColor, 0.05);
    particles.mesh.material.uniforms.uFogColor.value.copy(tmpColor);
    _renderer.setClearColor(tmpColor.getHex());


    _initAnimation = Math.min(_initAnimation + dt * 0.00025, 1);
    simulator.initAnimation = _initAnimation;

    _control.update();

    // update mouse3d
    _camera.updateMatrixWorld();
    _ray.origin.setFromMatrixPosition(_camera.matrixWorld);
    _ray.direction.set(settings.mouse.x, settings.mouse.y, 0.5).unproject(_camera).sub(_ray.origin).normalize();
    var distance = _ray.origin.length() / Math.cos(Math.PI - _ray.direction.angleTo(_ray.origin));
    _ray.origin.add(_ray.direction.multiplyScalar(distance * 1.0));

    settings.deltaDistance = math.distanceTo(settings.mouseX - settings.prevMouseX, settings.mouseY - settings.prevMouseY);
    if (settings.deltaDistance) {
        settings.deltaDistance /= 10;
    }
    settings.prevMouse.copy(settings.mouse);

    settings.insetExtra += ((settings.speed ? 0 : 0.25) - settings.insetExtra) * dt * (settings.speed ? 0.01 : 0.003);
    simulator.update(dt);
    particles.preRender(dt);


    fxaa.enabled = !!settings.fxaa;
    // dof.enabled = !!settings.dof;
    // motionBlur.enabled = !!settings.motionBlur;
    // bloom.enabled = !!settings.bloom;
    postprocessing.render(dt, newTime);

    settings.prevMouseX = settings.mouseX;
    settings.prevMouseY = settings.mouseY;

}

quickLoader.add('images/matcap_metal.jpg', {
    onLoad: function (img) {
        settings.sphereMap = img;
    }
});

quickLoader.start(function (percent) {
    if (percent === 1) {
        init();
    }
});

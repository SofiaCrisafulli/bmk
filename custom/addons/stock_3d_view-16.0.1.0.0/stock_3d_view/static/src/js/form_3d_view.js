/** @odoo-module **/

odoo.define('stock_3d_view.action_open_form_3d_view', [
    'web.AbstractAction',
    'web.core',
    'web.rpc',
    'web.Dialog',
    'web.ajax',
    '@web/core/registry',
], function (require) {
    'use strict';

    const AbstractAction = require('web.AbstractAction');
    const core     = require('web.core');
    const rpc      = require('web.rpc');
    const Dialog   = require('web.Dialog');
    const ajax     = require('web.ajax');
    const { registry } = require('@web/core/registry');
    const QWeb     = core.qweb;

    // --- Dialogo posicionado bajo el puntero ---
    const PositionDialog = Dialog.extend({
        init(parent, options) {
            this._super.apply(this, arguments);
            this.pointer = options.pointer;
            this.onClickClose = options.close;
        },
        renderElement() {
            this._super.apply(this, arguments);
            this.$modal.find('.modal-dialog').css({
                position: 'absolute',
                left: this.pointer.x,
                top: this.pointer.y,
            });
        },
    });

    // --- Acción del cliente: abre la vista 3D ---
    const OpenForm3D = AbstractAction.extend({
        template: 'Location3DFormView',
        events: Object.assign({}, AbstractAction.prototype.events, {
            'click .breadcrumb-item a': 'onBreadcrumbClick',
        }),

        onBreadcrumbClick(ev) {
            const jsId = this.$(ev.target).attr('jsId');
            this.actionService.restore(jsId);
        },

        init(parent, action) {
            this._super.apply(this, arguments);
            this.breadcrumbs   = parent.wowlEnv.config.breadcrumbs;
            this.actionService = parent.actionService;
        },

        start() {
            this.Open3DView();
        },

        // --- Lógica principal (igual a la tuya, solo re-formateada) ---
        Open3DView() {
            const self = this;

            let controls, renderer, clock, scene, camera, pointer, raycaster;
            let mesh, group, material;
            let loc_color, loc_opacity = 0.5, textSize;
            let selectedObject = null, dialogs = null;
            let data, loc_quant;

            const location_id =
                self.searchModel.config.context.loc_id ||
                localStorage.getItem('location_id');

            // Guardar loc/company en localStorage si llegan por contexto
            if (self.searchModel.config.context.loc_id != null) {
                localStorage.setItem('location_id', self.searchModel.config.context.loc_id);
                localStorage.setItem('company_id', self.searchModel.config.context.company_id);
            }

            // Leyenda de colores
            const colorDiv = document.createElement('div');
            colorDiv.classList.add('rectangle');
            const addSquare = (cls, txtCls, txt) => {
                const s = document.createElement('div'); s.classList.add(cls); colorDiv.appendChild(s);
                const t = document.createElement('div'); t.classList.add(txtCls); t.innerHTML = txt; colorDiv.appendChild(t);
            };
            addSquare('square1', 'squareText1', 'Overload');
            addSquare('square2', 'squareText2', 'Almost Full');
            addSquare('square3', 'squareText3', 'Free Space Available');
            addSquare('square4blue', 'squareText4', 'No Product/Load');

            start(); // fire & forget

            async function start() {
                // Traer datos
                await ajax.jsonRpc('/3Dstock/data/standalone', 'call', {
                    company_id: self.searchModel.config.context.company_id || localStorage.getItem('company_id'),
                    loc_id:     self.searchModel.config.context.loc_id     || localStorage.getItem('location_id'),
                }).then(incoming => { data = incoming; });

                // --- THREE setup (asegúrate de tener three.js/OrbitControls en assets) ---
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0xdfdfdf);
                clock = new THREE.Clock();
                camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 6000);
                camera.position.set(0, 200, 300);

                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight / 1.163);
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.render(scene, camera);

                const o_content = self.$('.o_content');
                o_content.append(renderer.domElement);
                self.$el.find('.o_content').append(colorDiv);

                controls = new THREE.OrbitControls(camera, renderer.domElement);

                const baseGeometry = new THREE.BoxGeometry(800, 0, 800);
                const baseMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffffff, transparent: false, opacity: 1, side: THREE.FrontSide,
                });
                const baseCube = new THREE.Mesh(baseGeometry, baseMaterial);
                scene.add(baseCube);

                group = new THREE.Group();

                for (const [key, value] of Object.entries(data)) {
                    if ((value[0] > 0) || (value[1] > 0) || (value[2] > 0) ||
                        (value[3] > 0) || (value[4] > 0) || (value[5] > 0)) {

                        const geometry = new THREE.BoxGeometry(value[3], value[5], value[4]);
                        geometry.translate(0, (value[5] / 2), 0);
                        const edges = new THREE.EdgesGeometry(geometry);

                        await ajax.jsonRpc('/3Dstock/data/quantity', 'call', { loc_code: key })
                                  .then(q => { loc_quant = q; });

                        if (localStorage.getItem('location_id') == value[6]) {
                            if (loc_quant[0] > 0) {
                                if (loc_quant[1] > 100) { loc_color = 0xcc0000; loc_opacity = 0.8; }
                                else if (loc_quant[1] > 50) { loc_color = 0xe6b800; loc_opacity = 0.8; }
                                else { loc_color = 0x00802b; loc_opacity = 0.8; }
                            } else {
                                if (loc_quant[1] == -1) { loc_color = 0x00802b; loc_opacity = 0.8; }
                                else { loc_color = 0x0066ff; loc_opacity = 0.8; }
                            }
                        } else {
                            loc_color = 0x8c8c8c; loc_opacity = 0.5;
                        }

                        material = new THREE.MeshBasicMaterial({ color: loc_color, transparent: true, opacity: loc_opacity });
                        mesh = new THREE.Mesh(geometry, material);

                        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404040 }));
                        line.position.set(value[0], value[1], value[2]);
                        mesh.position.set(value[0], value[1], value[2]);

                        const loader = new THREE.FontLoader();
                        loader.load('https://threejs.org/examples/fonts/droid/droid_sans_bold.typeface.json', function (font) {
                            const textcolor = 0x000000;
                            const textMat = new THREE.MeshBasicMaterial({ color: textcolor, side: THREE.DoubleSide });
                            const textmessage = key;
                            textSize = (value[3] > value[4]) ? (value[4] / 2) - (value[4] / 2.9) : (value[3] / 2) - (value[3] / 2.9);

                            const textshapes   = font.generateShapes(textmessage, textSize);
                            const textgeometry = new THREE.ShapeGeometry(textshapes);
                            textgeometry.translate(0, ((value[5] / 2) - (textSize / (textSize - 1.5))), 0);
                            const text = new THREE.Mesh(textgeometry, textMat);
                            if (value[4] > value[3]) {
                                text.rotation.y = Math.PI / 2;
                                text.position.set(value[0], value[1], value[2] + (textSize * 2) + ((value[3] / 3.779 / 2) / 2) + (textSize / 2));
                            } else {
                                text.position.set(value[0] - (textSize * 2) - ((value[4] / 3.779 / 2) / 2) - (textSize / 2), value[1], value[2]);
                            }
                            scene.add(text);
                        });

                        scene.add(mesh);
                        scene.add(line);
                        mesh.name = key;
                        mesh.userData = { color: loc_color, loc_id: value[6] };
                        group.add(mesh);
                    }
                }

                scene.add(group);
                raycaster = new THREE.Raycaster();
                pointer   = new THREE.Vector3();
                animate();
            }

            function onWindowResize() {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight / 1.163);
            }

            function animate() {
                requestAnimationFrame(animate);
                clock.getDelta();
                renderer.render(scene, camera);

                const canvas   = document.getElementsByTagName('canvas')[0];
                const colorBox = document.querySelector('.rectangle');

                if (!canvas) {
                    window.removeEventListener('dblclick', onPointerMove);
                    window.removeEventListener('resize', onWindowResize);
                    if (colorBox) colorBox.style.display = 'none';
                } else {
                    window.addEventListener('dblclick', onPointerMove);
                    window.addEventListener('resize', onWindowResize);
                    if (colorBox) colorBox.style.display = 'block';
                }
            }

            async function onPointerMove(event) {
                if (dialogs !== null) { return; }

                if (selectedObject) {
                    selectedObject.material.color.set(selectedObject.userData.color);
                    selectedObject = null;
                    return;
                }

                pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
                pointer.y = -(event.clientY / window.innerHeight) * 2 + 1 + 0.13;
                raycaster.setFromCamera(pointer, camera);
                const intersects = raycaster.intersectObject(group, true);

                if (!intersects.length) { return; }
                const res = intersects.find(r => r && r.object);
                if (!res || !res.object) { return; }
                if (res.object.userData.loc_id != localStorage.getItem('location_id')) { return; }

                let products = [];
                await ajax.jsonRpc('/3Dstock/data/product', 'call', { loc_code: res.object.name })
                          .then(p => { products = p; });

                selectedObject = res.object;
                selectedObject.material.color.set(0x00ffcc);

                const onClickClose = () => {
                    if (selectedObject) {
                        selectedObject.material.color.set(selectedObject.userData.color);
                        selectedObject = null;
                    }
                    dialogs && dialogs.close();
                    dialogs = null;
                };

                dialogs = new PositionDialog(this, {
                    title: 'Location: ' + res.object.name,
                    size: 'small',
                    $content: $(QWeb.render('ViewLocationData', { data: products })),
                    placement: 'bottom',
                    renderFooter: false,
                    pointer: { x: event.clientX, y: event.clientY },
                    close: onClickClose,
                }).open();

                if (dialogs) window.addEventListener('click', onClickClose);
                else window.removeEventListener('click', onClickClose);
            }
        },
    });

    // --- Registro de la acción (OWL y legacy) ---
    registry.category('actions').add('open_form_3d_view', OpenForm3D);
    core.action_registry.add('open_form_3d_view', OpenForm3D);

    return OpenForm3D;
});
/** @odoo-module **/

import { Component, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class OpenForm3D extends Component {
    setup() {
        this.action = this.props.action || {};
        this.actionService = useService("action");
        this.rpc = useService("rpc");
        this.dialog = useService("dialog");

        // 3D refs
        this._three = {
            scene: null,
            camera: null,
            renderer: null,
            group: null,
            raycaster: null,
            pointer: null,
            animateId: null,
            onResize: null,
            onDblClick: null,
        };

        onMounted(async () => {
            // Contexto
            const ctx = this.action.context || {};
            const company_id = ctx.company_id ?? localStorage.getItem("company_id");
            const loc_id     = ctx.loc_id     ?? localStorage.getItem("location_id");
            if (ctx.company_id) localStorage.setItem("company_id", ctx.company_id);
            if (ctx.loc_id)     localStorage.setItem("location_id", ctx.loc_id);

            // Traer layout de ubicaciones
            const data = await this.rpc("/3Dstock/data/standalone", { company_id, loc_id });

            // Inicializar escena
            await this.initThree(data);
        });

        onWillUnmount(() => this.teardownThree());
    }

    async initThree(data) {
        // Asegurate de haber incluido THREE + OrbitControls por assets locales
        // (ver manifest más abajo). Acá asumimos window.THREE disponible.
        const root = this.el.querySelector(".o_3d_container");
        const THREE = window.THREE;
        const T = this._three;

        // Escena/cámara/renderer
        T.scene = new THREE.Scene();
        T.scene.background = new THREE.Color(0xdfdfdf);

        T.camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        T.camera.position.set(0, 200, 300);

        T.renderer = new THREE.WebGLRenderer({ antialias: true });
        T.renderer.setSize(root.clientWidth, root.clientHeight);
        T.renderer.setPixelRatio(window.devicePixelRatio);
        root.appendChild(T.renderer.domElement);

        // Base
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(800, 0, 800),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        T.scene.add(base);

        // Controles (si OrbitControls está cargado)
        if (THREE.OrbitControls) {
            const controls = new THREE.OrbitControls(T.camera, T.renderer.domElement);
            controls.update();
        }

        // Grupo de ubicaciones
        T.group = new THREE.Group();
        T.scene.add(T.group);

        // Raycaster
        T.raycaster = new THREE.Raycaster();
        T.pointer = new THREE.Vector2();

        // Leyenda simple (HTML)
        this.mountLegend(root);

        // Construir cubos por cada ubicación
        await this.buildLocations(data);

        // Listeners
        T.onResize = () => {
            T.camera.aspect = root.clientWidth / root.clientHeight;
            T.camera.updateProjectionMatrix();
            T.renderer.setSize(root.clientWidth, root.clientHeight);
        };
        T.onDblClick = (ev) => this.onCanvasDblClick(ev);

        window.addEventListener("resize", T.onResize);
        T.renderer.domElement.addEventListener("dblclick", T.onDblClick);

        // Loop
        const animate = () => {
            T.animateId = requestAnimationFrame(animate);
            T.renderer.render(T.scene, T.camera);
        };
        animate();
    }

    async buildLocations(data) {
        const THREE = window.THREE;
        const T = this._three;
        const currentLocId = localStorage.getItem("location_id");

        for (const [code, v] of Object.entries(data)) {
            // v = [x,y,z, dx, dz, dy, loc_id]
            if ((v[0] | v[1] | v[2] | v[3] | v[4] | v[5]) === 0) continue;

            const geom = new THREE.BoxGeometry(v[3], v[5], v[4]);
            geom.translate(0, v[5] / 2, 0);
            const edges = new THREE.EdgesGeometry(geom);

            // Carga de ocupación
            const loc_quant = await this.rpc("/3Dstock/data/quantity", { loc_code: code });
            let color, opacity;
            if (String(currentLocId) === String(v[6])) {
                if (loc_quant[0] > 0) {
                    if (loc_quant[1] > 100) { color = 0xcc0000; opacity = 0.8; }
                    else if (loc_quant[1] > 50) { color = 0xe6b800; opacity = 0.8; }
                    else { color = 0x00802b; opacity = 0.8; }
                } else {
                    if (loc_quant[1] === -1) { color = 0x00802b; opacity = 0.8; }
                    else { color = 0x0066ff; opacity = 0.8; }
                }
            } else {
                color = 0x8c8c8c; opacity = 0.5;
            }

            const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            const cube = new THREE.Mesh(geom, mat);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404040 }));

            cube.position.set(v[0], v[1], v[2]);
            line.position.set(v[0], v[1], v[2]);

            cube.name = code;
            cube.userData = { color, loc_id: v[6] };

            T.group.add(cube);
            T.scene.add(line);

            // (Opcional) Etiqueta con FontLoader — si la necesitás, mantené tu código
            // y asegurá cargar la fuente local en assets.
        }
    }

    async onCanvasDblClick(event) {
        const T = this._three;
        const rect = T.renderer.domElement.getBoundingClientRect();

        // Normalizar coords del click
        T.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        T.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        T.raycaster.setFromCamera(T.pointer, T.camera);
        const intersects = T.raycaster.intersectObjects(T.group.children, false);
        if (!intersects.length) return;

        const obj = intersects[0].object;
        const currentLocId = localStorage.getItem("location_id");
        if (String(obj.userData.loc_id) !== String(currentLocId)) return;

        // Traer productos de la ubicación
        const products = await this.rpc("/3Dstock/data/product", { loc_code: obj.name });

        // Abrir un diálogo simple
        const body = products && products.length
            ? `<div style="max-height:50vh;overflow:auto;">
                 ${products.map((p) => `<div>${_.escape(p)}</div>`).join("")}
               </div>`
            : "<div>Sin productos</div>";

        this.dialog.add(ConfirmationDialog, {
            title: `Location: ${obj.name}`,
            body,
            confirmLabel: "OK",
            cancelLabel: "Cerrar",
            // No necesitamos callback; es informativo
            confirm: () => {},
            cancel: () => {},
        });
    }

    mountLegend(root) {
        const legend = document.createElement("div");
        legend.classList.add("rectangle");
        legend.style.position = "absolute";
        legend.style.right = "12px";
        legend.style.top = "12px";
        legend.style.background = "rgba(255,255,255,.9)";
        legend.style.padding = "8px 10px";
        legend.style.borderRadius = "8px";
        legend.style.boxShadow = "0 2px 6px rgba(0,0,0,.08)";
        legend.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="width:12px;height:12px;background:#cc0000;display:inline-block"></span> Overload
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="width:12px;height:12px;background:#e6b800;display:inline-block"></span> Almost Full
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="width:12px;height:12px;background:#00802b;display:inline-block"></span> Free Space
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="width:12px;height:12px;background:#0066ff;display:inline-block"></span> No Product/Load
          </div>
        `;
        root.style.position = "relative";
        root.appendChild(legend);
    }

    teardownThree() {
        const T = this._three;
        try {
            window.removeEventListener("resize", T.onResize);
            if (T.renderer?.domElement) {
                T.renderer.domElement.removeEventListener("dblclick", T.onDblClick);
            }
            if (T.animateId) cancelAnimationFrame(T.animateId);
            // Limpieza básica
            T.renderer?.dispose?.();
        } catch (_) {}
    }
}

OpenForm3D.template = "stock_3d_view.Location3DFormView";
registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
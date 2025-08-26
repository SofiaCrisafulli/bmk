/** @odoo-module **/

import { Component, onMounted, onWillUnmount, xml, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class OpenForm3D extends Component {
    setup() {
        // Servicios
        this.rpc = useService("rpc");
        this.dialog = useService("dialog");

        // Contenedor del canvas
        this.containerRef = useRef("container");

        // Estado/refs de THREE
        this.T = {
            scene: null, camera: null, renderer: null, group: null,
            raycaster: null, pointer: null, animateId: null,
            onResize: null, onDblClick: null,
        };

        // Montaje
        onMounted(async () => {
            const root = this.containerRef.el;
            if (!root) return;

            // Contexto
            const ctx = this.props.action?.context || {};
            const company_id = ctx.company_id ?? localStorage.getItem("company_id");
            const loc_id     = ctx.loc_id     ?? localStorage.getItem("location_id");
            if (ctx.company_id) localStorage.setItem("company_id", ctx.company_id);
            if (ctx.loc_id)     localStorage.setItem("location_id", ctx.loc_id);

            // Traer layout
            const data = await this.rpc("/3Dstock/data/standalone", { company_id, loc_id });

            // Inicializar escena
            await this.initThree(root, data);
        });

        // Desmontaje
        onWillUnmount(() => this.teardownThree());
    }

    // ========= 3D: escena/base/eventos =========
    async initThree(root, data) {
        const THREE = window.THREE;
        const T = this.T;

        // Fondo estilo v16
        T.scene = new THREE.Scene();
        T.scene.background = new THREE.Color(0xdedede);

        // Cámara
        T.camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        T.camera.position.set(600, 300, 600);

        // Luces suaves (mejor contraste de aristas)
        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        const dir = new THREE.DirectionalLight(0xffffff, 0.2);
        dir.position.set(1, 2, 1);
        T.scene.add(ambient, dir);

        // Renderer
        T.renderer = new THREE.WebGLRenderer({ antialias: true });
        T.renderer.setSize(root.clientWidth, root.clientHeight);
        T.renderer.setPixelRatio(window.devicePixelRatio);
        root.appendChild(T.renderer.domElement);

        // Piso blanco
        T.scene.add(new THREE.Mesh(
            new THREE.BoxGeometry(1200, 0, 1200),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        ));

        // OrbitControls (opcional)
        if (THREE.OrbitControls) {
            const controls = new THREE.OrbitControls(T.camera, T.renderer.domElement);
            if (typeof controls.update === "function") controls.update();
        }

        // Leyenda
        this.mountLegend(root);

        // Picking
        T.group = new THREE.Group();  T.scene.add(T.group);
        T.raycaster = new THREE.Raycaster();
        T.pointer   = new THREE.Vector2();

        // Construir ubicaciones
        await this.buildLocations(data);

        // Eventos
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

    // ========= Construcción de cubos + rótulos =========
    async buildLocations(data) {
        const THREE = window.THREE;
        const T = this.T;

        // Paleta/opacity como v16
        const EDGE_COLOR = 0x404040;
        const GREY_FILL  = 0x8c8c8c;
        const SELECTED   = 0xcc0000;
        const GREEN      = 0x00802b;
        const YELLOW     = 0xe6b800;
        const BLUE       = 0x0066ff;

        const currentLocId = String(localStorage.getItem("location_id"));

        for (const [code, v] of Object.entries(data)) {
            // v = [x,y,z, dx, dz, dy, loc_id]
            const [x, y, z, dx, dz, dy, loc_id] = v.map(Number);
            if (!dx || !dy || !dz) continue;

            // Caja + aristas
            const geom  = new THREE.BoxGeometry(dx, dy, dz);
            geom.translate(0, dy / 2, 0);
            const edges = new THREE.EdgesGeometry(geom);

            // Color por ocupación
            let color = GREY_FILL, opacity = 0.25;
            try {
                const [hasQty, percent] = await this.rpc("/3Dstock/data/quantity", { loc_code: code });
                const isCurrent = String(loc_id) === currentLocId;

                if (isCurrent) {
                    if (hasQty > 0) {
                        if (percent > 100)      { color = SELECTED; opacity = 0.6; }
                        else if (percent > 50)  { color = YELLOW;   opacity = 0.35; }
                        else                    { color = GREEN;    opacity = 0.35; }
                    } else {
                        color   = (percent === -1) ? GREEN : BLUE;
                        opacity = 0.35;
                    }
                } else {
                    color = GREY_FILL; opacity = 0.18;
                }
            } catch (_) {
                color = GREY_FILL; opacity = 0.18;
            }

            const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            const cube = new THREE.Mesh(geom, mat);
            const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: EDGE_COLOR }));

            cube.position.set(x, y, z);
            wire.position.set(x, y, z);

            cube.name = code;
            cube.userData = { color, loc_id };

            T.group.add(cube);
            T.scene.add(wire);

            // Rótulo
            this.addTextLabel(code, { x, y, z, dx, dz, dy });
        }
    }

    // ========= Texto sobre la cara superior =========
    addTextLabel(code, box) {
        const THREE = window.THREE;
        const { x, y, z, dx, dz, dy } = box;
        const fontUrl = "/stock_3d_view/static/lib/three/fonts/droid_sans_bold.typeface.json";

        const loader = new THREE.FontLoader();
        loader.load(fontUrl, (font) => {
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
            const textSize = (dx > dz) ? (dz / 2) - (dz / 2.9) : (dx / 2) - (dx / 2.9);

            const shapes = font.generateShapes(code, Math.max(8, textSize));
            const geo    = new THREE.ShapeGeometry(shapes);
            geo.translate(0, (dy / 2) - 1, 0);

            const mesh = new THREE.Mesh(geo, textMaterial);

            if (dz > dx) {
                mesh.rotation.y = Math.PI / 2;
                mesh.position.set(x, y, z + (textSize * 2) + ((dx / 3.779 / 2) / 2) + (textSize / 2));
            } else {
                mesh.position.set(x - (textSize * 2) - ((dz / 3.779 / 2) / 2) - (textSize / 2), y, z);
            }
            this.T.scene.add(mesh);
        });
    }

    // ========= Interacción: doble click → diálogo =========
    async onCanvasDblClick(event) {
        const T = this.T;
        const rect = T.renderer.domElement.getBoundingClientRect();

        T.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        T.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        T.raycaster.setFromCamera(T.pointer, T.camera);
        const hits = T.raycaster.intersectObjects(T.group.children, false);
        if (!hits.length) return;

        const obj = hits[0].object;
        const currentLocId = String(localStorage.getItem("location_id"));
        if (String(obj.userData.loc_id) !== currentLocId) return;

        const products = await this.rpc("/3Dstock/data/product", { loc_code: obj.name });

        const bodyHtml = (products && products.length)
            ? `<div style="max-height:55vh;overflow:auto">
                 ${products.map((p) => `<div>${String(p).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]))}</div>`).join("")}
               </div>`
            : "<div>Sin productos</div>";

        this.dialog.add(ConfirmationDialog, {
            title: `Location: ${obj.name}`,
            body: bodyHtml,
            confirmLabel: "OK",
            cancelLabel: "Cerrar",
            confirm: () => {},
            cancel: () => {},
        });
    }

    // ========= UI auxiliar =========
    mountLegend(root) {
        const legend = document.createElement("div");
        legend.style.cssText =
          "position:absolute;right:12px;top:12px;background:rgba(255,255,255,.92);padding:8px 10px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.08);font-size:12px";
        legend.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:12px;height:12px;background:#cc0000;display:inline-block"></span> Overload</div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:12px;height:12px;background:#e6b800;display:inline-block"></span> Almost Full</div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:12px;height:12px;background:#00802b;display:inline-block"></span> Free Space</div>
          <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:12px;height:12px;background:#0066ff;display:inline-block"></span> No Product/Load</div>
        `;
        root.style.position = "relative";
        root.appendChild(legend);
    }

    teardownThree() {
        const T = this.T;
        try {
            window.removeEventListener("resize", T.onResize);
            T.renderer?.domElement?.removeEventListener("dblclick", T.onDblClick);
            if (T.animateId) cancelAnimationFrame(T.animateId);
            T.renderer?.dispose?.();
        } catch (_) {}
    }
}

// Template inline (evita assets_qweb mientras migrás)
OpenForm3D.template = xml/* xml */`
  <div class="o_3d_wrap">
    <div t-ref="container" class="o_3d_container" style="width:100%; height:70vh; position:relative;"></div>
  </div>
`;

// Registro del client action
registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
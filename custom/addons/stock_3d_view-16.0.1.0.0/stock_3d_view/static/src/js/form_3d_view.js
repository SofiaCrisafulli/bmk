/** @odoo-module **/

import { Component, onMounted, onWillUnmount, xml, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class OpenForm3D extends Component {
    setup() {
        this.rpc = useService("rpc");
        this.dialog = useService("dialog");

        // contenedor canvas
        this.containerRef = useRef("container");

        // refs THREE
        this.T = {
            scene: null, camera: null, renderer: null, group: null,
            raycaster: null, pointer: null, animateId: null,
            onResize: null, onDblClick: null,
        };

        onMounted(async () => {
            const root = this.containerRef.el;
            if (!root) return;

            // contexto (company/loc)
            const ctx = this.props.action?.context || {};
            const company_id = ctx.company_id ?? localStorage.getItem("company_id");
            const loc_id     = ctx.loc_id     ?? localStorage.getItem("location_id");
            if (ctx.company_id) localStorage.setItem("company_id", ctx.company_id);
            if (ctx.loc_id)     localStorage.setItem("location_id", ctx.loc_id);

            // trae layout
            const data = await this.rpc("/3Dstock/data/standalone", { company_id, loc_id });

            await this.initThree(root, data);
        });

        onWillUnmount(() => this.teardownThree());
    }

    async initThree(root, data) {
        const THREE = window.THREE;
        const T = this.T;

        // escena
        T.scene = new THREE.Scene();
        T.scene.background = new THREE.Color(0xdfdfdf);

        T.camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        T.camera.position.set(0, 200, 300);

        T.renderer = new THREE.WebGLRenderer({ antialias: true });
        T.renderer.setSize(root.clientWidth, root.clientHeight);
        T.renderer.setPixelRatio(window.devicePixelRatio);
        root.appendChild(T.renderer.domElement);

        // base
        T.scene.add(new THREE.Mesh(
            new THREE.BoxGeometry(800, 0, 800),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        ));

        // controles
        if (THREE.OrbitControls) {
            const controls = new THREE.OrbitControls(T.camera, T.renderer.domElement);
            controls.update();
        }

        // leyenda (HTML)
        this.mountLegend(root);

        // grupo y raycaster
        T.group = new THREE.Group();  T.scene.add(T.group);
        T.raycaster = new THREE.Raycaster();
        T.pointer   = new THREE.Vector2();

        // construir cubos
        await this.buildLocations(data);

        // eventos
        T.onResize = () => {
            T.camera.aspect = root.clientWidth / root.clientHeight;
            T.camera.updateProjectionMatrix();
            T.renderer.setSize(root.clientWidth, root.clientHeight);
        };
        T.onDblClick = (ev) => this.onCanvasDblClick(ev);

        window.addEventListener("resize", T.onResize);
        T.renderer.domElement.addEventListener("dblclick", T.onDblClick);

        // loop
        const animate = () => {
            T.animateId = requestAnimationFrame(animate);
            T.renderer.render(T.scene, T.camera);
        };
        animate();
    }

    async buildLocations(data) {
        const THREE = window.THREE;
        const T = this.T;
        const currentLocId = String(localStorage.getItem("location_id"));

        for (const [code, v] of Object.entries(data)) {
            // v = [x,y,z, dx, dz, dy, loc_id]
            if ((v[0] | v[1] | v[2] | v[3] | v[4] | v[5]) === 0) continue;

            const geom  = new THREE.BoxGeometry(v[3], v[5], v[4]);
            geom.translate(0, v[5]/2, 0);
            const edges = new THREE.EdgesGeometry(geom);

            const [hasQty, percent] = await this.rpc("/3Dstock/data/quantity", { loc_code: code });

            let color, opacity;
            if (String(v[6]) === currentLocId) {
                if (hasQty > 0) {
                    if (percent > 100)      { color = 0xcc0000; opacity = 0.8; }
                    else if (percent > 50)  { color = 0xe6b800; opacity = 0.8; }
                    else                    { color = 0x00802b; opacity = 0.8; }
                } else {
                    color   = (percent === -1) ? 0x00802b : 0x0066ff;
                    opacity = 0.8;
                }
            } else { color = 0x8c8c8c; opacity = 0.5; }

            const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            const cube = new THREE.Mesh(geom, mat);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404040 }));

            cube.position.set(v[0], v[1], v[2]);
            line.position.set(v[0], v[1], v[2]);

            cube.name = code;
            cube.userData = { color, loc_id: v[6] };

            T.group.add(cube);
            T.scene.add(line);
        }
    }

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

// Template inline (no dependemos de assets_qweb mientras migrás)
OpenForm3D.template = xml/* xml */`
  <div class="o_3d_wrap">
    <div t-ref="container" class="o_3d_container" style="width:100%; height:70vh; position:relative;"></div>
  </div>
`;

registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
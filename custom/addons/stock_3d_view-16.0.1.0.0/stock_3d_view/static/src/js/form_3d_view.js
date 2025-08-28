/** @odoo-module **/

import { Component, onMounted, onWillUnmount, xml, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";

// ---------- Cuerpo del diálogo (lista simple) ----------
class ProductsListBody extends Component {
    static template = xml/* xml */`
      <div style="max-height:55vh;overflow:auto">
        <t t-if="items and items.length">
          <ul class="list-unstyled m-0">
            <t t-foreach="items" t-as="line" t-key="line">
              <li><t t-esc="line"/></li>
            </t>
          </ul>
        </t>
        <t t-else="">
          <div>Sin productos</div>
        </t>
      </div>
    `;
    static props = { items: Array };
}

// ---------- Escena 3D ----------
class OpenForm3D extends Component {
    setup() {
        this.rpc = useService("rpc");
        this.dialog = useService("dialog");
        this.containerRef = useRef("container");

        this.T = {
            scene: null, camera: null, renderer: null, group: null,
            raycaster: null, pointer: null, animateId: null,
            onResize: null, onDblClick: null, controls: null,
        };

        onMounted(async () => {
            const root = this.containerRef.el;
            if (!root) return;

            const ctx = this.props.action?.context || {};
            const company_id = ctx.company_id ?? localStorage.getItem("company_id");
            const loc_id = ctx.loc_id ?? localStorage.getItem("location_id");
            if (ctx.company_id) localStorage.setItem("company_id", ctx.company_id);
            if (ctx.loc_id) localStorage.setItem("location_id", ctx.loc_id);

            let data = {};
            try {
                data = await this.rpc("/3Dstock/data/standalone", { company_id, loc_id });
            } catch (e) {
                console.error("[3D] RPC standalone error:", e);
            }

            await this.initThree(root, data);

            // Si no hay cubos, agregar uno de test.
            setTimeout(() => {
                const count = this.T.group?.children?.length || 0;
                if (count === 0) {
                    const THREE = window.THREE;
                    const geom = new THREE.BoxGeometry(200, 80, 120);
                    const edges = new THREE.EdgesGeometry(geom);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
                    const cube = new THREE.Mesh(geom, mat);
                    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404040 }));
                    this.T.group.add(cube);
                    this.T.scene.add(wire);
                }
            }, 0);
        });

        onWillUnmount(() => this.teardownThree());
    }

    async initThree(root, data) {
        const THREE = window.THREE;
        const T = this.T;

        T.scene = new THREE.Scene();
        T.scene.background = new THREE.Color(0xdedede);

        T.camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        T.camera.position.set(600, 300, 600);

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        const dir = new THREE.DirectionalLight(0xffffff, 0.2);
        dir.position.set(1, 2, 1);
        T.scene.add(ambient, dir);

        T.renderer = new THREE.WebGLRenderer({ antialias: true });
        T.renderer.setSize(root.clientWidth, root.clientHeight);
        T.renderer.setPixelRatio(window.devicePixelRatio);
        root.appendChild(T.renderer.domElement);

        if (THREE.OrbitControls) {
            T.controls = new THREE.OrbitControls(T.camera, T.renderer.domElement);
            T.controls.update?.();
        } else {
            console.warn("[3D] OrbitControls no disponible");
        }

        T.scene.add(new THREE.Mesh(
            new THREE.BoxGeometry(1200, 0, 1200),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        ));

        this.mountLegend(root);

        T.group = new THREE.Group(); T.scene.add(T.group);
        T.raycaster = new THREE.Raycaster();
        T.pointer = new THREE.Vector2();

        await this.buildLocations(data);
        this.fitToGroup();

        T.onResize = () => {
            T.camera.aspect = root.clientWidth / root.clientHeight;
            T.camera.updateProjectionMatrix();
            T.renderer.setSize(root.clientWidth, root.clientHeight);
        };
        T.onDblClick = (ev) => this.onCanvasDblClick(ev);
        window.addEventListener("resize", T.onResize);
        T.renderer.domElement.addEventListener("dblclick", T.onDblClick);

        const animate = () => {
            T.animateId = requestAnimationFrame(animate);
            T.renderer.render(T.scene, T.camera);
        };
        animate();
    }

    fitToGroup(padding = 1.25) {
        const THREE = window.THREE;
        const T = this.T;
        if (!T.group || T.group.children.length === 0) return;
        const box = new THREE.Box3().setFromObject(T.group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z);
        const fov = (T.camera.fov * Math.PI) / 180;
        const dist = Math.abs(maxSize / (2 * Math.tan(fov / 2))) * padding;

        T.camera.near = Math.max(0.1, dist / 100);
        T.camera.far = dist * 1000;
        T.camera.position.copy(center.clone().add(new THREE.Vector3(dist, dist, dist)));
        T.camera.lookAt(center);
        T.camera.updateProjectionMatrix();

        if (T.controls) {
            T.controls.target?.copy?.(center);
            T.controls.update?.();
        }
    }

    async buildLocations(data) {
        const THREE = window.THREE;
        const T = this.T;

        const EDGE = 0x404040, GREY = 0x8c8c8c, RED = 0xcc0000, GREEN = 0x00802b, YELLOW = 0xe6b800, BLUE = 0x0066ff;
        const currentLocId = String(localStorage.getItem("location_id") || "");

        let drawn = 0;
        for (const [code, raw] of Object.entries(data || {})) {
            const v = Array.isArray(raw) ? raw.map(n => Number(n)) : [];
            let [x, y, z, dx, dz, dy, loc_id] = v;

            x = Number.isFinite(x) ? x : 0;
            y = Number.isFinite(y) ? y : 0;
            z = Number.isFinite(z) ? z : 0;
            dx = Number.isFinite(dx) ? dx : 100;
            dz = Number.isFinite(dz) ? dz : 80;
            dy = Number.isFinite(dy) ? dy : 60;

            const maxDim = Math.max(dx, dy, dz);
            const SCALE = maxDim < 20 ? 10 : 1;
            dx *= SCALE; dy *= SCALE; dz *= SCALE;
            x *= SCALE; y *= SCALE; z *= SCALE;

            const geom = new THREE.BoxGeometry(dx, dy, dz);
            geom.translate(0, dy / 2, 0);
            const edges = new THREE.EdgesGeometry(geom);

            let color = GREY, opacity = 0.18;
            try {
                const [hasQty, percent] = await this.rpc("/3Dstock/data/quantity", { loc_code: code });
                const isCurrent = String(loc_id) === currentLocId;
                if (isCurrent) {
                    if (hasQty > 0) {
                        if (percent > 100) { color = RED; opacity = 0.60; }
                        else if (percent > 50) { color = YELLOW; opacity = 0.35; }
                        else { color = GREEN; opacity = 0.35; }
                    } else {
                        color = (percent === -1) ? GREEN : BLUE;
                        opacity = 0.35;
                    }
                }
            } catch (_) { }

            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            const cube = new THREE.Mesh(geom, mat);
            const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: EDGE }));

            cube.position.set(x, y, z);
            wire.position.set(x, y, z);
            cube.name = code;
            cube.userData = { color, loc_id };

            T.group.add(cube);
            T.scene.add(wire);
            drawn++;
        }

        if (!drawn) {
            const geom = new THREE.BoxGeometry(200, 80, 120);
            const edges = new THREE.EdgesGeometry(geom);
            const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
            const cube = new THREE.Mesh(geom, mat);
            const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x404040 }));
            T.group.add(cube);
            T.scene.add(wire);
        }
    }

    // ---------- Doble click: abrir diálogo ----------
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
        console.log("[3D] products RPC:", products);

        const items = Array.isArray(products)
            ? products.map((p) => (typeof p === "string" ? p : (p.display_name || p.name || JSON.stringify(p))))
            : [];
        console.log("[3D] items to render:", items);

        this.dialog.add(Dialog, {
            title: `Location: ${obj.name}`,
            body: ProductsListBody,
            bodyProps: { items },    // <-- ¡clave! props PARA el body
            buttons: [
                { label: "OK", primary: true },
                { label: "Cerrar", close: true },
            ],
        });
    }

    // ---------- UI auxiliar ----------
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
        } catch (_) { }
    }
}

// ---------- Template del client action ----------
OpenForm3D.template = xml/* xml */`
  <div class="o_3d_wrap">
    <div t-ref="container" class="o_3d_container" style="width:100%; height:70vh; position:relative;"></div>
  </div>
`;

// ---------- Registro ----------
registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
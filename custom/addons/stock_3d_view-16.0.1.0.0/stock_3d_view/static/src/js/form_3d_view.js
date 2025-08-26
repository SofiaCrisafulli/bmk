/** @odoo-module **/

import { Component, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// Si de verdad necesitás Dialog, usá el service moderno:
// import { Dialog } from "@web/core/dialog/dialog";  // o usa dialog service

class OpenForm3D extends Component {
    setup() {
        this.action = this.props.action || {};
        this.actionService = useService("action");
        this.rpc = useService("rpc");
        this.dialog = useService("dialog");

        onMounted(async () => {
            // ejemplo: leer contexto
            const ctx = this.action.context || {};
            const company_id = ctx.company_id || localStorage.getItem("company_id");
            const loc_id     = ctx.loc_id     || localStorage.getItem("location_id");

            if (ctx.company_id) localStorage.setItem("company_id", ctx.company_id);
            if (ctx.loc_id)     localStorage.setItem("location_id", ctx.loc_id);

            // reemplazá ajax.jsonRpc por rpc service
            const data = await this.rpc("/3Dstock/data/standalone", { company_id, loc_id });

            await this.initThreeScene(data);
        });
    }

    async initThreeScene(data) {
        const root = this.el.querySelector(".o_3d_container");

        // Asegurate que THREE esté incluido por assets (ideal: versión local en tu módulo)
        const scene = new window.THREE.Scene();
        scene.background = new window.THREE.Color(0xdfdfdf);

        const camera = new window.THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        camera.position.set(0, 200, 300);

        const renderer = new window.THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(root.clientWidth, root.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        root.appendChild(renderer.domElement);

        const baseGeometry = new window.THREE.BoxGeometry(800, 0, 800);
        const baseMaterial = new window.THREE.MeshBasicMaterial({ color: 0xffffff });
        scene.add(new window.THREE.Mesh(baseGeometry, baseMaterial));

        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // 👉 porta acá tu bucle de cubos, raycaster y llamados a:
        // await this.rpc("/3Dstock/data/quantity", { loc_code })
        // await this.rpc("/3Dstock/data/product", { loc_code })
    }
}

// Usa EXACTAMENTE el nombre de tu template QWeb:
OpenForm3D.template = "stock_3d_view.Location3DFormView";

// 🔑 Registrar el client action en el registry v17
registry.category("actions").add("open_form_3d_view", OpenForm3D);

export default OpenForm3D;
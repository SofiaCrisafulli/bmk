/** @odoo-module **/

import { Component, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
// Si querés cargar scripts externos (three.js) on-demand:
import { loadJS } from "@web/core/assets";

class OpenForm3D extends Component {
    setup() {
        this.action = this.props.action || {};
        this.envServices = {
            action: useService("action"),
            rpc: useService("rpc"),
            dialog: useService("dialog"),
        };

        onMounted(async () => {
            // 1) Cargar dependencias si no están empaquetadas en assets
            //    (ideal: incluilas locales en assets y NO uses CDN)
            // await loadJS("/stock_3d_view/static/lib/three/three.min.js");
            // await loadJS("/stock_3d_view/static/lib/three/OrbitControls.js");

            // 2) Leer contexto
            const ctx = this.action.context || {};
            const company_id = ctx.company_id || window.localStorage.getItem("company_id");
            const loc_id     = ctx.loc_id     || window.localStorage.getItem("location_id");

            if (ctx.loc_id) {
                window.localStorage.setItem("location_id", ctx.loc_id);
            }
            if (ctx.company_id) {
                window.localStorage.setItem("company_id", ctx.company_id);
            }

            // 3) Traer data (reemplaza tus ajax.jsonRpc por el rpc service)
            let data = await this.envServices.rpc("/3Dstock/data/standalone", {
                company_id,
                loc_id,
            });

            // 4) Render 3D
            await this.initThreeScene(data);
        });
    }

    async initThreeScene(data) {
        // Contenedor donde montamos el canvas
        const root = this.el.querySelector(".o_3d_container");

        // Asegurate de tener THREE disponible (por assets o por loadJS arriba)
        const scene = new window.THREE.Scene();
        scene.background = new window.THREE.Color(0xdfdfdf);

        const camera = new window.THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.5, 6000);
        camera.position.set(0, 200, 300);

        const renderer = new window.THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(root.clientWidth, root.clientHeight);
        root.appendChild(renderer.domElement);

        // Ejemplo de base:
        const baseGeometry = new window.THREE.BoxGeometry(800, 0, 800);
        const baseMaterial = new window.THREE.MeshBasicMaterial({ color: 0xffffff });
        scene.add(new window.THREE.Mesh(baseGeometry, baseMaterial));

        // TODO: porta aquí tu loop que crea meshes/labels y tu lógica de raycaster
        //       (usa this.envServices.rpc para /3Dstock/data/quantity y /product)

        // Controles (si los cargaste)
        if (window.THREE.OrbitControls) {
            const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
            controls.update();
        }

        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();
    }
}
OpenForm3D.template = "stock_3d_view.Location3DFormView"; // usa tu template XML (ver assets abajo)

// Registrar la acción para el tag existente
registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
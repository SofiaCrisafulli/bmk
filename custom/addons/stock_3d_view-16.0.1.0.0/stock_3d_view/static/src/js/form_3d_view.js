/** @odoo-module **/

import { Component, onMounted, onWillUnmount, xml, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class OpenForm3D extends Component {
    setup() {
        this.rpc = useService("rpc");

        // 👇 referencia directa al div contenedor
        this.containerRef = useRef("container");

        onMounted(async () => {
            const root = this.containerRef.el;
            if (!root) {
                console.warn("[stock_3d_view] containerRef.el no está listo");
                return;
            }
            // ← acá montás THREE sobre `root`
            // ej. para probar:
            root.textContent = "Template inline cargado ✔ (montá THREE aquí)";
        });

        onWillUnmount(() => {
            // cleanup si corresponde
        });
    }
}

// ✅ Template inline con t-ref (evita assets_qweb mientras depurás)
OpenForm3D.template = xml/* xml */`
  <div class="o_3d_wrap">
    <div t-ref="container" class="o_3d_container" style="width:100%; height:70vh; position:relative;"></div>
  </div>
`;

registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;
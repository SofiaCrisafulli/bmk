/** @odoo-module **/

import { Component, onMounted, onWillUnmount, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
// import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog"; // si lo usás

class OpenForm3D extends Component {
    setup() {
        this.action = this.props.action || {};
        this.rpc = useService("rpc");
        // ...tu setup...
        onMounted(async () => {
            const root = this.el.querySelector(".o_3d_container");
            // acá ya podés montar THREE, etc.
            root.textContent = "Template inline cargado ✔ (reemplazá por THREE)";
        });
        onWillUnmount(() => { /* cleanup */ });
    }
}

// ⬅️ Inline template: NO depende de web.assets_qweb
OpenForm3D.template = xml/* xml */`
  <div class="o_3d_wrap">
    <div class="o_3d_container" style="width:100%; height:70vh; position:relative;"></div>
  </div>
`;

registry.category("actions").add("open_form_3d_view", OpenForm3D);
export default OpenForm3D;OpenForm3D.template
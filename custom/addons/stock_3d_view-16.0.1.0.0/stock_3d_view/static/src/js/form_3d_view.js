/** @odoo-module **/

import { registry } from "@web/core/registry";

console.log("[stock_3d_view] cargando JS…");

// Handler mínimo para probar registro del tag
registry.category("actions").add("open_form_3d_view", async (env, action) => {
    console.log("[stock_3d_view] handler ejecutado con action:", action);
    // Abre cualquier cosa simple para validar
    await env.services.action.doAction({
        type: "ir.actions.act_window",
        name: "Prueba 3D",
        res_model: "res.partner",
        view_mode: "tree,form",
        target: "current",
    });
});
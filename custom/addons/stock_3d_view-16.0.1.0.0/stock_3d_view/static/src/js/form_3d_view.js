/** @odoo-module **/

import { registry } from "@web/core/registry";

console.log("[stock_3d_view] cargando JS…");

registry.category("actions").add("open_form_3d_view", async (env, action) => {
    console.log("[stock_3d_view] handler ejecutado con action:", action);
    try {
        await env.services.action.doAction({
            type: "ir.actions.act_window",
            name: "Prueba 3D",
            res_model: "res.partner",
            // 🔴 En algunos paths core espera views explícito
            views: [
                [false, "list"],   // en 17 "list" reemplaza a "tree"
                [false, "form"],
            ],
            view_mode: "list,form",
            target: "current",
            context: {},
        });
    } catch (e) {
        console.error("[stock_3d_view] doAction falló:", e);
        // Fallback ultra simple para confirmar que el tag está OK
        await env.services.notification.add("Cliente 3D: tag registrado ✔", { type: "info" });
    }
});
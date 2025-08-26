/** @odoo-module **/

odoo.define('stock_3d_view.action_open_form_3d_view', [
    '@web/core/registry',
    'web.AbstractAction',
    'web.core',
], function (require) {
    'use strict';

    const { registry } = require('@web/core/registry');
    const AbstractAction = require('web.AbstractAction');
    const core = require('web.core');

    console.debug('[stock_3d_view] módulo JS cargado');

    const OpenForm3D = AbstractAction.extend({
        template: 'Location3DFormView',
        start() {
            console.debug('[stock_3d_view] start() de OpenForm3D');
            // 👉 Aquí, cuando veas que ya registra, re-inserta tu Open3DView()
            return this._super.apply(this, arguments);
        },
    });

    // Registro OWL + legacy (por compatibilidad)
    registry.category('actions').add('open_form_3d_view', OpenForm3D);
    core.action_registry.add('open_form_3d_view', OpenForm3D);

    console.debug('[stock_3d_view] acción registrada: open_form_3d_view');
    return OpenForm3D;
});
/** @odoo-module **/

odoo.define('stock_3d_view.action_open_form_3d_view', [
    'web.AbstractAction',
    'web.core',
    'web.rpc',
    'web.Dialog',
    'web.ajax',
], function (require) {
    'use strict';

    var AbstractAction = require('web.AbstractAction');
    var core   = require('web.core');
    var rpc    = require('web.rpc');
    var Dialog = require('web.Dialog');
    var ajax   = require('web.ajax');
    var QWeb   = core.qweb;

    var PositionDialog = Dialog.extend({
        init: function (parent, options) {
            this._super.apply(this, arguments);
            this.pointer = options.pointer;
            this.onClickClose = options.close;
        },
        renderElement: function () {
            this._super.apply(this, arguments);
            this.$modal.find('.modal-dialog').css({
                position: 'absolute',
                left: this.pointer.x,
                top: this.pointer.y,
            });
        },
    });

    var open_form_3d_view = AbstractAction.extend({
        template: 'Location3DFormView',
        events: Object.assign({}, AbstractAction.prototype.events, {
            'click .breadcrumb-item a': 'onBreadcrumbClick',
        }),
        onBreadcrumbClick: function (ev) {
            let jsId = this.$(ev.target).attr('jsId');
            this.actionService.restore(jsId);
        },
        init: function (parent, action) {
            this._super.apply(this, arguments);
            this.breadcrumbs    = parent.wowlEnv.config.breadcrumbs;
            this.actionService  = parent.actionService;
        },
        start: function () {
            this.Open3DView();
        },
        Open3DView: function () {
            // --- tu código tal como lo tienes ---
            // Asegúrate de que THREE y OrbitControls estén cargados (ver nota de assets abajo).
        },
    });

    core.action_registry.add('open_form_3d_view', open_form_3d_view);
    return open_form_3d_view;
});
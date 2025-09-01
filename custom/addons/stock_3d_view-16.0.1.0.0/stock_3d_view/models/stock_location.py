# -*- coding: utf-8 -*-
from odoo import fields, models


class StockLocation(models.Model):
    """Extend stock.location with 3D fields."""
    _inherit = 'stock.location'

    length = fields.Float(string="Length (M)", help="Length of the location in meters")
    width = fields.Float(string="Width (M)", help="Width of the location in meters")
    height = fields.Float(string="Height (M)", help="Height of the location in meters")
    pos_x = fields.Float(string="X (in px)", help="Position of the location along X-axis")
    pos_y = fields.Float(string="Y (in px)", help="Position of the location along Y-axis")
    pos_z = fields.Float(string="Z (in px)", help="Position of the location along Z-axis")
    unique_code = fields.Char(string="Location Code", help="Unique code of the location")
    max_capacity = fields.Integer(string="Capacity (Units)", help="Maximum capacity of the location in terms of Units")

    _sql_constraints = [
        ('unique_code', 'UNIQUE(unique_code)', "The location code must be unique!"),
    ]

    def action_view_location_3d_button(self):
        self.ensure_one()
        # Solo ubicaciones con el mismo padre (location_id) que la actual:
        if self.location_id:
            # La actual tiene padre → mostrar hermanos (incluida la actual)
            domain = [
                ('usage', '=', 'internal'),
                ('location_id', '=', self.location_id.id),
            ]
            parent_location_id = self.location_id.id
        else:
            # La actual es raíz → mostrar solo raíces (location_id = False)
            domain = [
                ('usage', '=', 'internal'),
                ('location_id', '=', False),
            ]
            parent_location_id = False

        return {
            'type': 'ir.actions.client',
            'tag': 'open_form_3d_view',
            'name': 'Mapa 3D',
            'context': {
                'location_domain': domain,
                'parent_location_id': parent_location_id,
                'loc_id': self.id,            # por si tu RPC lo usa
                'company_id': self.company_id.id,
            },
            'target': 'current',
        }
# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class QuantPackage(models.Model):
    _inherit = 'stock.quant.package'

    package_use = fields.Selection([
        ('disposable', 'Disposable Box'),
        ('reusable', 'Reusable Box'),
        ], string='Package Use', default='disposable', required=True,
        help="""Reusable boxes are used for batch picking and emptied afterwards to be reused. In the barcode application, scanning a reusable box will add the products in this box.
        Disposable boxes aren't reused, when scanning a disposable box in the barcode application, the contained products are added to the transfer.""")

    @api.model
    def get_reusable_packages_by_barcode(self):
        packages = self.env['stock.quant.package'].search_read(
            [('package_use', '=', 'reusable')],
            ['name', 'location_id'])
        packagesByBarcode = {package['name']: package for package in packages}
        return packagesByBarcode

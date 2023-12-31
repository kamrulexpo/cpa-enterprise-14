odoo.define('stock_barcode_picking_batch.LinesWidget', function (require) {
'use strict';

const LinesWidget = require('stock_barcode.LinesWidget');

LinesWidget.include({

    /**
     * @override
     */
    init: function (parent, page, pageIndex, nbPages) {
        this._super(...arguments);
        if (this.model === 'stock.picking.batch') {
            const suggestedPackagesByPickings = {};
            const parentLines = parent._getLines(parent.currentState);
            // Checks if a line has a result package, and if so, links it to the according picking.
            parentLines.forEach(line => {
                if (line.result_package_id && !suggestedPackagesByPickings[line.picking_id.id]) {
                    suggestedPackagesByPickings[line.picking_id.id] = line.result_package_id[1];
                }
            });
            // Suggests a package to scan for each picking's lines if this picking is linked to a package.
            this.page.lines.forEach(line => {
                if (!line.result_package_id && suggestedPackagesByPickings[line.picking_id.id]) {
                    line.suggested_package = suggestedPackagesByPickings[line.picking_id.id];
                }
            });
        }
    },

    /**
     * Called when user scans a reusable package's barcode. It will put in pack the current
     * line and will suggest the same package for the other lines of the same picking.
     *
     * @param {integer} id_or_virtual_id
     * @param {Object} clusterPackage
     */
    _applyClusterPackages: function (id_or_virtual_id, clusterPackage) {
        const lines = this.page.lines;
        const line = lines.find(l => id_or_virtual_id === (l.id || l.virtual_id));
        const pickingId = line.picking_id.id;
        // Applies the package on the current line.
        line.result_package_id = [
            clusterPackage.id,
            clusterPackage.name,
        ];
        // Suggests the same package for other same picking's lines.
        lines.forEach(line => {
            if (line.picking_id.id === pickingId && !(line.result_package_id || line.suggested_package)) {
                line.suggested_package = clusterPackage.name;
            }
        });
        // Re-render all the barcode lines.
        this.$el.filter('.o_barcode_lines_header').empty();
        this.$el.filter('.o_barcode_lines').empty();
        this._renderLines();
        const $line = $(`.o_barcode_line[data-id=${(line.id || line.virtual_id)}]`);
        this._highlightLine($line);
    },

    /**
     * Sorting function for picking lines. This function sorts by picking name first so this order follows
     * when other sorting criteria are equal.
     *
     * @override
     */
    _sortProductLines: function (lines) {
        if (this.model === 'stock.picking.batch') {
            lines.sort(function(a,b) {
                return a.picking_id.name > b.picking_id.name ? 1 : a.picking_id.name < b.picking_id.name ? -1 : 0;
            });
        }
        return this._super.apply(this, arguments);
    },

    /**
     * @override
     */
    _getErrorName: function () {
        const errorNames = this._super.apply(this);
        errorNames.push(
            'picking_batch_already_done',
            'picking_batch_already_cancelled',
            'picking_batch_draft',
            'picking_batch_empty'
        );
        return errorNames;
    },

    /**
     * @override
     */
    _renderLines: function () {
        if (this.model === 'stock.picking.batch') {
            if (this.mode === 'done') {
                this._toggleScanMessage('picking_batch_already_done');
                return;
            } else if (this.mode === 'cancel') {
                this._toggleScanMessage('picking_batch_already_cancelled');
                return;
            } else if (this.mode === 'draft') {
                this._toggleScanMessage('picking_batch_draft');
                return;
            } else if (this.nbPages === 0) {
                this._toggleScanMessage('picking_batch_empty');
                return;
            }
        }
        return this._super.apply(this, arguments);
    }
});

});

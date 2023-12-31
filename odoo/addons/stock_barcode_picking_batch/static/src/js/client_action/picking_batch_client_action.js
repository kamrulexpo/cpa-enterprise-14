odoo.define('stock_barcode.BatchPickingClientAction', function (require) {
'use strict';

const core = require('web.core');
const PickingClientAction = require('stock_barcode.picking_client_action');
const ViewsWidget = require('stock_barcode.ViewsWidget');

const _t = core._t;

const BatchPickingClientAction = PickingClientAction.extend({
    custom_events: Object.assign({}, PickingClientAction.prototype.custom_events, {
        'print_picking_batch': '_onPrintPickingBatch',
    }),

    init: function (parent, action) {
        this._super.apply(this, arguments);
        this.actionParams.model = 'stock.picking.batch';
        this.actionParams.id = action.params.picking_batch_id;
        this.methods.validate = 'action_done';
        this.viewInfo = 'stock_barcode_picking_batch.stock_barcode_batch_picking_view_info';
    },

    willStart: function () {
        const res = this._super.apply(this, arguments);
        return res.then(() => {
            if (this.currentState.state === 'draft') {
                this.mode = 'draft';
            }
            return this._getReusablePackageBarcodes();
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _getAddLineDefaultValues: function (currentPage) {
        const values = this._super(currentPage);
        values.default_batch_id = this.currentState.id;
        values.default_picking_id = this.currentState.picking_ids[0].id;
        return values;
    },

    /**
     * Make an rpc to get the package barcodes and afterwards set `this.reusablePackagesByBarcode`.
     *
     * @private
     * @return {Promise}
     */
    _getReusablePackageBarcodes: function () {
        return this._rpc({
            'model': 'stock.quant.package',
            'method': 'get_reusable_packages_by_barcode',
            'args': [],
        }).then(res => {
            this.reusablePackagesByBarcode = res;
        });
    },

    /**
     * @override
     */
    _instantiateViewsWidget: function (defaultValues, params) {
        return new ViewsWidget(
            this,
            'stock.move.line',
            'stock_barcode_picking_batch.stock_move_line_product_selector_inherit',
            defaultValues,
            params
        );
    },

    /**
     * @override
     */
    _isAbleToCreateNewLine: function () {
        return false;
    },

    /**
     * @override
     */
    _isControlButtonsEnabled: function () {
        return this.mode !== 'draft' && this._super();
    },

    /**
     * @override
     */
    _isOptionalButtonsEnabled: function () {
        return this.mode !== 'draft';
    },

    /**
     * @override
     */
    _makePages: function () {
        if (!this.currentState.picking_ids.length) {
            // Don't create any pages if the record is empty.
            return [];
        }
        return this._super.apply(this, arguments);
    },

    /**
     * @override
     */
    _notify_cancellation: function () {
        this.do_notify(false, _t("The batch picking has been cancelled"));
    },

    /**
     * Call `action_print` on the `picking.batch.model` to save the batch
     * picking as a pdf.
     * @private
     */
    _printPickingBatch: function () {
        this.mutex.exec(() => {
            return this._save().then(() => {
                return this._rpc({
                    'model': 'stock.picking.batch',
                    'method': 'action_print',
                    'args': [[this.actionParams.id]],
                }).then((res) => {
                    return this.do_action(res);
                });
            });
        });
    },

    /**
     * @override
     */
    _validate: function () {
        this._super({ barcode_view: true });
    },

    // -------------------------------------------------------------------------
    // Private: flow steps
    // -------------------------------------------------------------------------

    /**
     * @override
     */
    _step_lot: function (barcode, linesActions) {
        // Bypass this step if needed.
        let prom = Promise.reject();
        if (this.reusablePackagesByBarcode[barcode]) {
            prom = this._step_reusable_package(barcode, linesActions);
        }
        return prom.catch(this._super.bind(this, ...arguments));
    },

    /**
     * @override
     */
    _step_product: function (barcode, linesActions) {
        // Bypass this step if needed.
        if (this.reusablePackagesByBarcode[barcode]) {
            return this._step_reusable_package(barcode, linesActions);
        }
        return this._super(...arguments);
    },

    /**
     * Checks if user scanned a reusable package barcode.
     *
     * @param {string} barcode
     * @param {Array} linesActions
     * @returns {Promise}
     */
    _step_reusable_package: function (barcode, linesActions) {
        const reusablePackage = this.reusablePackagesByBarcode[barcode];
        if (!reusablePackage) {
            // No reusable package found.
            return Promise.reject();
        }
        if (reusablePackage.location_id && reusablePackage.location_id[0] !== this.currentState.location_dest_id.id) {
            return Promise.reject(_t("The scanned package must not be assigned to a location or must be assigned to the current dest location."));
        }
        // Set the result package on the last scanned line.
        const lineId = this.scannedLines[this.scannedLines.length - 1];
        const lines = this.pages[this.currentPageIndex].lines;
        const currentLine = lines.find(line => line.id === lineId);
        // No line found -> Need to scan a product first.
        if (!currentLine) {
            return Promise.reject();
        }
        linesActions.push([
            this.linesWidget._applyClusterPackages,
            [currentLine.id || currentLine.virtualId, reusablePackage],
        ]);
        return Promise.resolve({linesActions: linesActions});
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Handles the `print_picking_batch` OdooEvent.
     * It makes an RPC call to the method 'action_print'.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onPrintPickingBatch: function (ev) {
        ev.stopPropagation();
        this._printPickingBatch();
    },
});

core.action_registry.add('stock_barcode_picking_batch_client_action', BatchPickingClientAction);

return BatchPickingClientAction;

});

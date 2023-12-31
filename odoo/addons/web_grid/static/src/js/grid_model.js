odoo.define('web_grid.GridModel', function (require) {
"use strict";

var AbstractModel = require('web.AbstractModel');
var concurrency = require('web.concurrency');
var utils = require('web.utils');

const { _t } = require('web.core');

const GridModel = AbstractModel.extend({
    /**
     * GridModel
     *
     * All data will be loaded in the _gridData object and can be retrieved with
     * the `get` method.
     */

    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this._gridData = null;
        this._fetchMutex = new concurrency.MutexedDropPrevious();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @returns {Object}
     */
    __get: function () {
        return this._gridData;
    },
    /**
     * @override
     * @param {Object} context
     * @returns {Object}
     */
    getContext: function (context) {
        var c = _.extend({}, this.context, context);
        return c;
    },
    /**
     * The data from the grid view basically come from a read_group so we don't
     * have any res_ids. A big domain is thus computed with the domain of all
     * cells and this big domain is used to search for res_ids.
     *
     * @returns {Promise<integer[]>} the list of ids used in the grid
     */
    getIds: function () {
        var data = this._gridData.data;
        if (!_.isArray(data)) {
            data = [data];
        }

        var domain = [];
        // count number of non-empty cells and only add those to the search
        // domain, on sparse grids this makes domains way smaller
        var cells = 0;

        for (var i = 0; i < data.length; i++) {
            var grid = data[i].grid;

            for (var j = 0; j < grid.length; j++) {
                var row = grid[j];
                for (var k = 0; k < row.length; k++) {
                    var cell = row[k];
                    if (cell.size !== 0) {
                        cells++;
                        domain.push.apply(domain, cell.domain);
                    }
                }
            }
        }

        // if there are no elements in the grid we'll get an empty domain
        // which will select all records of the model... that is *not* what
        // we want
        if (cells === 0) {
            return Promise.resolve([]);
        }

        while (--cells > 0) {
            domain.unshift('|');
        }

        return this._rpc({
            model: this.modelName,
            method: 'search',
            args: [domain],
            context: this.getContext(),
        });
    },
    /**
     * @override
     * @param {Object} params
     * @returns {Promise}
     */
    __load: function (params) {
        this.fields = params.fields;
        this.modelName = params.modelName;
        this.rowFields = params.rowFields;
        this.sectionField = params.sectionField;
        this.colField = params.colField;
        this.cellField = params.cellField;
        this.ranges = params.ranges;
        this.currentRange = params.currentRange;
        this.domain = params.domain;
        this.context = params.context;
        var groupedBy = (params.groupedBy && params.groupedBy.length) ?
            params.groupedBy : this.rowFields;
        this.groupedBy = Array.isArray(groupedBy) ? groupedBy : [groupedBy];
        this.readonlyField = params.readonlyField;
        return this._fetch(this.groupedBy);
    },
    /**
     * @override
     * @param {any} handle this parameter is ignored
     * @param {Object} params
     * @returns {Promise}
     */
    __reload: function (handle, params) {
        if (params === 'special') {
            return Promise.resolve();
        }
        params = params || {};
        if ('context' in params) {
            // keep the grid anchor, when reloading view (e.i.: removing a filter in search view)
            var old_context = this.context;
            this.context = params.context;
            if (old_context.grid_anchor !== undefined || params.context.grid_anchor !== undefined) {
                this.context.grid_anchor = old_context.grid_anchor || params.context.grid_anchor;
            }
        }
        if ('domain' in params) {
            this.domain = params.domain;
        }
        if ('pagination' in params) {
            _.extend(this.context, params.pagination);
        }
        if ('range' in params) {
            this.currentRange = _.findWhere(this.ranges, {name: params.range});
        }
        if ('groupBy' in params) {
            if (params.groupBy.length) {
                this.groupedBy = Array.isArray(params.groupBy) ?
                    params.groupBy : [params.groupBy];
            } else {
                this.groupedBy = this.rowFields;
            }
        }
        return this._fetch(this.groupedBy);
    },
    reloadCell: function (cell, cellField, colField) {
        var self = this;
        var domain = cell.col.domain.concat(this.domain);
        var domainRow = cell.row.values;
        for (var value in domainRow) {
            domain = domain.concat([[value.toString(), '=', domainRow[value][0]]]);
        }
        if (this._gridData.isGrouped) {
            var groupLabel = this._gridData.data[cell.cell_path[0]].__label;
            domain = domain.concat([[this._gridData.groupBy[0], '=', groupLabel[0]]]);
        }

        return this._rpc({
            model: this.modelName,
            method: 'read_group',
            kwargs: {
                domain: domain,
                fields: [cellField],
                groupby: [colField],
            },
            context: this.getContext()
        }).then(function (result) {
            if (result.length === 0 || !(cellField in result[0])) {
                return Promise.resolve();
            }
            var currentCell = utils.into(self._gridData.data, cell.cell_path);
            currentCell.value = result[0][cellField];
            currentCell.size = result[0][colField + '_count'];
            currentCell.domain = domain;
            self._gridData.data.forEach((group, groupIndex) => {
                self._gridData.data[groupIndex].totals = self._computeTotals(group.grid);
            });
            self._gridData.totals = self._computeTotals(_.flatten(_.pluck(self._gridData.data, 'grid'), true));
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object[]} grid
     * @returns {{super: number, rows: {}, columns: {}}}
     */
    _computeTotals: function (grid) {
        const totals = {
            super: 0,
            rows: {},
            columns: {}
        };
        for (let i = 0; i < grid.length; i++) {
            const row = grid[i];
            for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                totals.super += cell.value;
                totals.rows[i] = (totals.rows[i] || 0) + cell.value;
                totals.columns[j] = (totals.columns[j] || 0) + cell.value;
            }
        }
        return totals;
    },
    /**
     * @private
     * @param {Object} rows
     * @param {boolean} grouped
     * @returns {string[]}
     */
    _getRowLabel(row, grouped) {
        let groupBy = this.groupedBy;
        if (grouped) {
            groupBy = groupBy.slice(1);
        }
        const rowValues = [];
        for (let i = 0; i < groupBy.length; i++) {
            const rowField = groupBy[i];
            let value = row.values[rowField];
            const fieldName = rowField.split(':')[0]; // remove groupby function (:day, :month...)
            const fieldType = this.fields[fieldName].type;
            if (fieldType === 'selection') {
                value = this.fields[fieldName].selection.find(function (choice) {
                    return choice[0] === value;
                });
            }
            value = value && ["many2one", "selection"].includes(fieldType) ? value[1] : value;
            rowValues.push(value);
        }
        return rowValues;
    },
    /**
     * @private
     * @param {string[]} groupBy
     * @returns {Promise}
     */
    _fetch: function (groupBy) {
        var self = this;

        if (!this.currentRange) {
            return Promise.resolve();
        }

        return this._fetchMutex.exec(function () {
            if (self.sectionField && self.sectionField === groupBy[0]) {
                return self._fetchGroupedData(groupBy);
            } else {
                return self._fetchUngroupedData(groupBy);
            }
        });
    },
    /**
     * @private
     * @param {string[]} groupBy
     * @returns {Promise}
     */
    _fetchGroupedData: function (groupBy) {
        var self = this;
        return this._rpc({
            model: self.modelName,
            method: 'read_grid_domain',
            kwargs: {
                field: self.colField,
                range: self.currentRange,
            },
            context: self.getContext(),
        }).then(function (d) {
            return self._rpc({
                model: self.modelName,
                method: 'read_group',
                kwargs: {
                    domain: d.concat(self.domain || []),
                    fields: [self.sectionField],
                    groupby: [self.sectionField],
                },
                context: self.getContext()
            });
        }).then(function (groups) {
            if (!groups.length) {
                // if there are no groups in the output we still need
                // to fetch an empty grid so we can render the table's
                // decoration (pagination and columns &etc) otherwise
                // we get a completely empty grid
                return Promise.all([self._fetchSectionGrid(groupBy, {
                    __domain: self.domain || [],
                })]);
            }
            return Promise.all((groups || []).map(function (group) {
                return self._fetchSectionGrid(groupBy, group);
            }));
        }).then(function (results) {
            if (!(_.isEmpty(results) || _.reduce(results, function (m, it) {
                    return _.isEqual(m.cols, it.cols) && m;
                }))) {
                throw new Error(_t("The sectioned grid view can't handle groups with different columns sets"));
            }
            results.forEach((group, groupIndex) => {
                results[groupIndex].totals = self._computeTotals(group.grid);
                group.rows.forEach((row, rowIndex) => {
                    results[groupIndex].rows[rowIndex].label = self._getRowLabel(row, true);
                });
            });
            self._gridData = {
                isGrouped: true,
                data: results,
                totals: self._computeTotals(_.flatten(_.pluck(results, 'grid'), true)),
                groupBy,
                colField: self.colField,
                cellField: self.cellField,
                range: self.currentRange.name,
                context: self.context,
            };
        });
    },
    /**
     * @private
     * @param {string[]} groupBy
     * @param {Object} sectionGroup
     * @param {Object} [additionalContext]
     * @returns {Promise}
     */
    _fetchSectionGrid: function (groupBy, sectionGroup, additionalContext) {
        var self = this;
        var rpcProm = this._rpc({
            model: this.modelName,
            method: 'read_grid',
            kwargs: {
                row_fields: groupBy.slice(1),
                col_field: this.colField,
                cell_field: this.cellField,
                range: this.currentRange,
                domain: sectionGroup.__domain,
                readonly_field: this.readonlyField,
            },
            context: this.getContext(additionalContext),
        })
        rpcProm.then(function (grid) {
            grid.__label = sectionGroup[self.sectionField];
        });
        return rpcProm;
    },
    /**
     * @private
     * @param {string[]} groupBy
     * @returns {Promise}
     */
    _fetchUngroupedData: function (groupBy) {
        var self = this;
        return this._rpc({
                model: self.modelName,
                method: 'read_grid',
                kwargs: {
                    row_fields: groupBy,
                    col_field: self.colField,
                    cell_field: self.cellField,
                    domain: self.domain,
                    range: self.currentRange,
                    readonly_field: this.readonlyField,
                },
                context: self.getContext(),
            })
            .then(function (result) {
                const rows = result.rows;
                rows.forEach((row, rowIndex) => {
                    result.rows[rowIndex].label = self._getRowLabel(row, false);
                });
                self._gridData = {
                    isGrouped: false,
                    data: [result],
                    totals: self._computeTotals(result.grid),
                    groupBy,
                    colField: self.colField,
                    cellField: self.cellField,
                    range: self.currentRange.name,
                    context: self.context,
                };
            });
    },
});

return GridModel;

});

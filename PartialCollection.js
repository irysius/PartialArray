define(["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    function canBeInteger(value) {
        if (typeof value === 'string') {
            var integer = parseInt(value, 10);
            return '' + integer === value;
        }
        else if (typeof value === 'number') {
            return Math.floor(value) === value;
        }
        else {
            return false;
        }
    }
    function isExistingResult(value) {
        if (!value) {
            return false;
        }
        return typeof value.start === 'number' &&
            typeof value.end === 'number' &&
            typeof value.results === 'object' && typeof value.results.map === 'function';
    }
    function isMissingResult(value) {
        if (!value) {
            return false;
        }
        return typeof value.start === 'number' &&
            typeof value.end === 'number' &&
            typeof value.results === 'undefined';
    }
    function asSkipTake(range) {
        return {
            skip: range.start,
            take: range.end - range.start + 1
        };
    }
    function finalizeTempResult(tempResult, index) {
        if (isExistingResult(tempResult) || isMissingResult(tempResult)) {
            tempResult.end = index - 1;
        }
        else {
            tempResult = null;
        }
        return tempResult;
    }
    function flatMap(items) {
        var i, j;
        var results = [];
        for (i = 0; i < items.length; ++i) {
            var item = items[i];
            for (j = 0; j < item.length; ++j) {
                results.push(item[j]);
            }
        }
        return results;
    }
    /**
     * Readonly
     */
    function PartialCollection(options) {
        var internal = {};
        var indexer = options.indexer, maxCount = options.maxCount, fetcher = options.fetcher, identifier = options.identifier;
        var _indexer = (function () {
            if (typeof indexer === 'string') {
                var prop_1 = indexer;
                return function (item) { return item[prop_1]; };
            }
            else {
                return indexer;
            }
        })();
        var _identifier = (function () {
            if (typeof identifier === 'string') {
                var prop_2 = identifier;
                return function (item) { return item[prop_2]; };
            }
            else {
                return identifier || (function (x) { return x; });
            }
        })();
        function throwIfUninitialized() {
            if (typeof maxCount !== 'number') {
                throw new Error('PartialCollection requires maxCount to be set to operate correctly.');
            }
        }
        function throwIfIndexerDNE(indices) {
            if (!_indexer) {
                if (typeof indices !== 'object' && typeof indices.map !== 'function') {
                    throw new Error('In the absence of an indexer, PartialCollection.(un)load needs the indices array to be provided.');
                }
            }
        }
        function getSingle(index) {
            throwIfUninitialized();
            // if index is out of bounds return undefined
            if (index >= maxCount || index < 0) {
                return void 0;
            }
            else {
                // we currently assume we don't store nulls.
                // if index is within bounds, return the item, 
                // or if it's not loaded yet, return null.
                return internal[index] || null;
            }
        }
        function getMany(range) {
            throwIfUninitialized();
            var _a = asSkipTake(range), skip = _a.skip, take = _a.take;
            var count = Math.min(skip + take, maxCount);
            var i;
            var results = [];
            var tempResult = null;
            for (i = skip; i < count; ++i) {
                var item = internal[i];
                if (item) {
                    if (isExistingResult(tempResult)) {
                        tempResult.results.push(item);
                    }
                    else {
                        // if tempResult is not an ExistingResult, finalize previous tempResult
                        // and declare new ExistingResult
                        var r_1 = finalizeTempResult(tempResult, i);
                        if (r_1) {
                            results.push(r_1);
                        }
                        tempResult = {
                            start: i, end: -1,
                            results: [item]
                        };
                    }
                }
                else {
                    if (!isMissingResult(tempResult)) {
                        // if tempResult is not a MissingResult
                        var r_2 = finalizeTempResult(tempResult, i);
                        if (r_2) {
                            results.push(r_2);
                        }
                        tempResult = {
                            start: i, end: -1
                        };
                    }
                }
            }
            var r = finalizeTempResult(tempResult, skip + take);
            if (r) {
                results.push(r);
            }
            return results;
        }
        function fillResultsGaps(partialResults) {
            throwIfUninitialized();
            var i;
            var results = [];
            var promises = partialResults.map(function (r) {
                if (isMissingResult(r)) {
                    return fetcher(r).then(function (results) {
                        return load(results);
                    });
                }
                else {
                    return Promise.resolve(r.results);
                }
            });
            return Promise.all(promises).then(function (results) {
                return flatMap(results);
            });
        }
        function load(items) {
            throwIfUninitialized();
            var results = [];
            items.forEach(function (item, i) {
                var index = _indexer(item);
                // Sanity check
                if (canBeInteger(index)) {
                    if (index < maxCount) {
                        var _item = _identifier(item);
                        internal['' + index] = _item;
                        results.push(_item);
                    }
                    else {
                        // consider logging warnings here, for exceeding maxCount
                    }
                }
                else {
                    // consider logging warnings here, for not having an integer index
                }
            });
            return results;
        }
        function unload(items) {
            items.forEach(function (item) {
                var index = _indexer(item);
                // more relaxed about indexing errors.
                delete internal['' + index];
            });
        }
        function unloadRange(range) {
            var _a = asSkipTake(range), skip = _a.skip, take = _a.take;
            var count = Math.min(skip + take, maxCount || Infinity);
            var i;
            for (i = skip; i < count; ++i) {
                delete internal['' + i];
            }
        }
        var proxy = {
            get: getSingle,
            fetch: function (range) {
                return fillResultsGaps(getMany(range));
            },
            load: load,
            unload: unload,
            unloadRange: unloadRange
        };
        Object.defineProperty(proxy, 'maxCount', {
            get: function () { return maxCount; },
            set: function (value) {
                if (typeof value === 'number' && !isNaN(value)) {
                    maxCount = value;
                }
            }
        });
        return proxy;
    }
    exports.PartialCollection = PartialCollection;
});

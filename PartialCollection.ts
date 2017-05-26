interface IMap<T> {
	[key: string]: T;
}
type Mapper<T, U> = (item: T) => U;
interface IOptions<T> {
	indexer: string|Mapper<T, number>;
	fetcher: (range: IRange) => Promise<T[]>;
	maxCount?: number;
}

export interface IRange {
	start: number; end: number;
}
type PartialResult<T> = (ExistingResult<T>|MissingResult)[];
type TempResult<T> = MissingResult|ExistingResult<T>|null;
interface ExistingResult<T> {
	start: number; end: number;
	results: T[];
}
interface MissingResult {
	start: number; end: number;
	results: undefined;
}
interface IPartialCollection<T> {
	maxCount?: number;
	get(index: number): T|null|undefined;
	fetch(range: IRange): Promise<T[]>;
	load(items: T[]): void;
	unload(items: T[]): void;
	unloadRange(range: IRange): void;
}


function canBeInteger(value: any): boolean {
	if (typeof value === 'string') {
		let integer = parseInt(value, 10);
		return '' + integer === value;
	} else if (typeof value === 'number') {
		return Math.floor(value) === value;
	} else {
		return false;
	}
}
function isExistingResult<T>(value: any): value is ExistingResult<T> {
	if (!value) { return false; }
	return typeof value.start === 'number' &&
		typeof value.end === 'number' &&
		typeof value.results === 'object' && typeof value.results.map === 'function';
}
function isMissingResult(value?: any|null): value is MissingResult {
	if (!value) { return false; }
	return typeof value.start === 'number' &&
		typeof value.end === 'number' &&
		typeof value.results === 'undefined';
}
function asSkipTake(range: IRange) {
	return {
		skip: range.start,
		take: range.end - range.start + 1
	};
}
function finalizeTempResult<T>(tempResult: TempResult<T>, index: number): TempResult<T> {
	if (isExistingResult<T>(tempResult) || isMissingResult(tempResult)) {
		tempResult.end = index - 1;
	} else {
		tempResult = null;
	}
	return tempResult;
}
function flatMap<T>(items: T[][]): T[] {
	let i, j;
	let results: T[] = [];
	for (i = 0; i < items.length; ++i) {
		let item = items[i];
		for (j = 0; j < item.length; ++j) {
			results.push(item[j]);
		}
	}
	return results;
}

/**
 * Readonly
 */
export function PartialCollection<T extends object>(options: IOptions<T>): IPartialCollection<T> {
	let internal: IMap<T> = { };
	let {
		indexer, maxCount, fetcher
	} = options;
	
	let _indexer = (function () {
		if (typeof indexer === 'string') {
			let prop = indexer;
			return (item: T) => (<any>item)[prop] as number;
		} else {
			return indexer;
		}
	})();

	function throwIfUninitialized() {
		if (typeof maxCount !== 'number') {
			throw new Error('PartialArray requires maxCount to be set to operate correctly.');
		}
	}

	function getSingle(index: number): T|null|undefined {
		throwIfUninitialized();
		// if index is out of bounds return undefined
		if (index >= maxCount! || index < 0) {
			return void 0;
		} else {
			// we currently assume we don't store nulls.
			// if index is within bounds, return the item, 
			// or if it's not loaded yet, return null.
			return internal[index] || null;
		}
	}

	function getMany(range: IRange): PartialResult<T> {
		throwIfUninitialized();
		let { skip, take } = asSkipTake(range);
		let count = Math.min(skip + take, maxCount!);
		let i;
		let results: PartialResult<T> = [];
		let tempResult: TempResult<T> = null;
		for (i = skip; i < count; ++i) {
			let item = internal[i];
			if (item) {
				if (isExistingResult<T>(tempResult)) {
					tempResult.results.push(item);
				} else {
					// if tempResult is not an ExistingResult, finalize previous tempResult
					// and declare new ExistingResult
					let r = finalizeTempResult<T>(tempResult, i);
					if (r) { results.push(r); }
					
					tempResult = {
						start: i, end: -1,
						results: [item]
					} as ExistingResult<T>;
				}
			} else {
				if (!isMissingResult(tempResult)) {
					// if tempResult is not a MissingResult
					let r = finalizeTempResult<T>(tempResult, i);
					if (r) { results.push(r); }

					tempResult = {
						start: i, end: -1
					} as MissingResult;
				}
			}
		}

		let r = finalizeTempResult<T>(tempResult, skip + take);
		if (r) { results.push(r); }

		return results;
	}

	function fillResultsGaps(partialResults: PartialResult<T>): Promise<T[]> {
		throwIfUninitialized();
		let i;
		let results: T[] = [];
		let promises: Promise<T[]>[] = partialResults.map(r => {
			if (isMissingResult(r)) {
				return fetcher(r).then(results => {
					load(results);
					return results;
				});
			} else {
				return Promise.resolve(r.results);
			}
		});

		return Promise.all(promises).then(results => {
			return flatMap(results);
		});
	}

	function load(items: T[]): void {
		throwIfUninitialized();
		items.forEach(item => {
			let index = _indexer(item);
			// Sanity check
			if (canBeInteger(index)) {
				if (index < maxCount!) { 
					internal['' + index] = item;
				} else {
					// consider logging warnings here, for exceeding maxCount
				}
			} else {
				// consider logging warnings here, for not having an integer index
			}
		});
	}
	function unload(items: T[]): void {
		items.forEach(item => {
			delete internal['' + _indexer(item)];
		});
	}
	function unloadRange(range: IRange): void {
		let { skip, take } = asSkipTake(range);
		let count = Math.min(skip + take, maxCount || Infinity);
		let i;
		for (i = skip; i < count; ++i) {
			delete internal['' + i];
		}
	}

	let proxy = {
		get: getSingle,
		fetch: (range: IRange) => {
			return fillResultsGaps(getMany(range));
		},
		load: load,
		unload: unload,
		unloadRange: unloadRange
	};
	Object.defineProperty(proxy, 'maxCount', {
		get: () => maxCount,
		set: (value: number) => { 
			if (typeof value === 'number' && !isNaN(value))	{
				maxCount = value;
			}
		}
	});
	return proxy as IPartialCollection<T>;
}



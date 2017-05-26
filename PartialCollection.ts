interface IMap<T> {
	[key: string]: T;
}
type Mapper<T, U> = (item: T) => U;
interface IOptions<T, U> {
	fetcher: (range: IRange) => Promise<U[]>;
	identifier?: string|Mapper<U, T>;
	indexer: string|Mapper<U, number>;
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
interface IPartialCollection<T, U> {
	maxCount?: number;
	get(index: number): T|null|undefined;
	fetch(range: IRange): Promise<T[]>;
	load(items: U[]): T[];
	unload(items: U[]): void;
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
export function PartialCollection<U extends object, T extends object = U>(options: IOptions<T, U>): IPartialCollection<T, U> {
	let internal: IMap<T> = { };
	let {
		indexer, maxCount, fetcher, identifier
	} = options;
	
	let _indexer = (function () {
		if (typeof indexer === 'string') {
			let prop = indexer;
			return (item: U) => (<any>item)[prop] as number;
		} else {
			return indexer;
		}
	})();
	let _identifier = (function () {
		if (typeof identifier === 'string') {
			let prop = identifier;
			return (item: U) => (<any>item)[prop] as T;
		} else {
			return identifier || ((x: any) => x as T);
		}
	})();

	function throwIfUninitialized() {
		if (typeof maxCount !== 'number') {
			throw new Error('PartialCollection requires maxCount to be set to operate correctly.');
		}
	}
	function throwIfIndexerDNE(indices?: number[]) {
		if (!_indexer) {
			if (typeof indices !== 'object' && typeof indices!.map !== 'function') {
				throw new Error('In the absence of an indexer, PartialCollection.(un)load needs the indices array to be provided.');
			}
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
					return load(results);
				});
			} else {
				return Promise.resolve(r.results);
			}
		});

		return Promise.all(promises).then(results => {
			return flatMap(results);
		});
	}

	function load(items: U[]): T[] {
		throwIfUninitialized();
		let results: T[] = [];
		items.forEach((item, i) => {
			let index = _indexer(item);
			// Sanity check
			if (canBeInteger(index)) {
				if (index < maxCount!) { 
					let _item = _identifier(item);
					internal['' + index] = _item;
					results.push(_item);
				} else {
					// consider logging warnings here, for exceeding maxCount
				}
			} else {
				// consider logging warnings here, for not having an integer index
			}
		});
		return results;
	}
	function unload(items: U[]): void {
		items.forEach(item => {
			let index = _indexer(item);
			// more relaxed about indexing errors.
			delete internal['' + index];
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
	return proxy as IPartialCollection<T, U>;
}



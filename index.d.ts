declare module 'PartialCollection' {
	interface IRange {
		start: number; end: number;
	}
	type Mapper<T, U> = (item: T) => U;
	interface IPartialCollection<T> {
		maxCount?: number;
		get(index: number): T;
		fetch(range: IRange): Promise<T[]>;
		load(items: any[]): T[];
		unload(items: any[]): void;
		unloadRange(range: IRange): void;
	}

	interface IOptions<T> {
		fetcher: (range: IRange) => Promise<any[]>;
		identifier?: string|Mapper<any, T>;
		indexer: string|Mapper<any, number>;
		maxCount?: number;
	}

	let Module: {
		PartialCollection<T>(options: IOptions<T>): IPartialCollection<T>;
	};
	export = Module;
}

import { PartialCollection, IRange } from './PartialCollection';

interface IPerson {
	firstName: string;
	lastName: string;
	rowNumber: number;
}

function fetch(range: IRange): Promise<IPerson[]> {
	return Promise.resolve([
		{ firstName: 'Alfred', lastName: 'Alvis', rowNumber: 13 },
		{ firstName: 'Bobby', lastName: 'Brush', rowNumber: 14 }
	]);
}

// The only mandatory option is the fetcher and indexer.
let collection = PartialCollection({
	indexer: 'rowNumber',
	fetcher: fetch,
	// identifier: x => x
});

// Need to provide maxCount to collection, otherwise warning erros will throw.
collection.maxCount = 50;
fetch({ start: 0, end: 19 }).then(people => {
	collection.load(people);
}).then(() => {
	return collection.fetch({ start: 13, end: 25 }).then(people => {
		// we expect fetch to, given that maxCount has been set,
		// and that we loaded 0-19, that items 20-25 would be fetched asynchronously
		// then returned to us here.
		console.log(people.length === 13); // should be true
	});
});

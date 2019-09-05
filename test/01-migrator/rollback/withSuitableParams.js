'use strict';

const tap = require('tap');
const expect = require('expect.js');
const testUtils = require('../../../testUtils');

tap.mochaGlobals();

describe('migrator rollback with suitable params', () => {
	let migrator;

	before(() => {
		return Promise.resolve()
			.then(() => testUtils.createMigrator({init: true, connect: true}))
			.then((createdMigrator) => {
				migrator = createdMigrator;
			});
	});

	const baseNames = ['first', 'second', 'third', 'second'];
	let names = [];

	before(() => {
		return Promise.resolve()
			.then(() => testUtils.createMigrations({migrator, baseNames}))
			.then((migrationNames) => {
				names = migrationNames;
			});
	});

	after(() => testUtils.removeMigrations({migrator, names}));

	after(() => testUtils.destroyMigrator({migrator}));

	it('rollback executed migration without errors', () => {
		return Promise.resolve()
			.then(() => migrator.loadMigration(names[0]))
			.then((migration) => migrator.rollback(migration));
	});

	it('expect that no `executed` migration at list', () => {
		return Promise.resolve()
			.then(() => migrator.adapter.getExecutedMigrationNames())
			.then((executedNames) => expect(executedNames).have.length(0));
	});

	it('expect that all migrations lists as `new` again', () => {
		return Promise.resolve()
			.then(() => migrator.getNewMigrationNames())
			.then((newNames) => expect(newNames).eql(names));
	});
});

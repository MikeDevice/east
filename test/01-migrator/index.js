'use strict';

const _ = require('underscore');
const tap = require('tap');
const expect = require('expect.js');
const pathUtils = require('path');
const pMap = require('p-map');
const testUtils = require('../../testUtils');
const Migrator = require('../../lib/migrator');

tap.mochaGlobals();

describe('migrator', () => {
	let migrator;

	before(() => {
		return Promise.resolve()
			.then(() => testUtils.createMigrator({init: true, connect: true}))
			.then((createdMigrator) => {
				migrator = createdMigrator;
			});
	});

	after(() => testUtils.destroyMigrator({migrator}));

	describe('adapter', () => {
		// just log used adapter name, useful for integration testing with
		// different adapters
		it(`should have a name "${migrator.params.adapter}"`, _.noop);
	});

	describe('getAllMigrationNames', () => {
		let expectedNames = [];

		before(() => {
			return Promise.resolve()
				.then(() => {
					const baseNames = [];
					const zCharcode = 'z'.charCodeAt(0);

					for (let index = 0; index < 12; index++) {
						const baseName = String.fromCharCode(zCharcode - index);

						baseNames.push(baseName);
					}

					return testUtils.createMigrations({migrator, baseNames});
				})
				.then((migrationNames) => {
					expectedNames = migrationNames;
				});
		});

		after(() => testUtils.removeMigrations({migrator, names: expectedNames}));

		it('should return numeric sorted names', () => {
			return Promise.resolve()
				.then(() => migrator.getAllMigrationNames())
				.then((names) => expect(names).eql(expectedNames));
		});
	});

	describe('execute', () => {
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

		it('execute migration without errors', () => {
			return Promise.resolve()
				.then(() => migrator.loadMigration(names[0]))
				.then((migration) => migrator.migrate(migration));
		});

		it('migration should be listed as `executed` after that', () => {
			return Promise.resolve()
				.then(() => migrator.adapter.getExecutedMigrationNames())
				.then((executedNames) => expect(executedNames).eql([names[0]]));
		});

		it(
			'execution of the same migration with force flag should passes ' +
			'without errors',
			() => {
				return Promise.resolve()
					.then(() => migrator.loadMigration(names[0]))
					.then((migration) => {
						migration.force = true;

						return migrator.migrate(migration);
					});
			}
		);

		it('migration should still be listed as `executed`', () => {
			return Promise.resolve()
				.then(() => migrator.adapter.getExecutedMigrationNames())
				.then((executedNames) => expect(executedNames).eql([names[0]]));
		});
	});

	describe('rollback', () => {
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

	describe('names normalization', () => {
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

		const nomrmalizeAndCheckName = (inputName, expectedName) => {
			return Promise.resolve()
				.then(() => migrator.normalizeNames([inputName]))
				.then((normalizedNames) => {
					expect(normalizedNames[0]).equal(expectedName);
				});
		};

		it('by path should be ok', () => {
			const name = names[0];
			const path = pathUtils.join('migrations', name);

			return nomrmalizeAndCheckName(path, name);
		});

		it('by full name should be ok', () => {
			const name = names[0];

			return nomrmalizeAndCheckName(name, name);
		});

		it('by number should be ok', () => {
			const number = '1';
			const name = names[0];

			return nomrmalizeAndCheckName(number, name);
		});

		it('by basename should be ok', () => {
			const baseName = baseNames[0];
			const name = names[0];

			return nomrmalizeAndCheckName(baseName, name);
		});

		it('by ambiguous basename should return an error', () => {
			const baseName = baseNames[1];

			return Promise.resolve()
				.then(() => migrator.normalizeNames([baseName]))
				.then((result) => {
					throw new Error(`Error expected, but got result: ${result}`);
				})
				.catch((err) => {
					expect(err).ok();
					expect(err).an(Error);
					expect(err.message).contain(
						`Specified migration name "${baseName}" is ambiguous`
					);
				});
		});
	});

	describe('remove', () => {
		const baseNames = ['first', 'second', 'third', 'second'];
		let names = [];

		before(() => {
			return Promise.resolve()
				.then(() => testUtils.createMigrations({migrator, baseNames}))
				.then((migrationNames) => {
					names = migrationNames;
				});
		});

		it('expect remove without errors', () => {
			return testUtils.removeMigrations({migrator, names});
		});

		it('removed migrations should not exist', () => {
			return Promise.resolve()
				.then(() => {
					return pMap(names, (name) => {
						return migrator.isMigrationExists(name);
					});
				})
				.then((existResults) => {
					existResults.forEach((existResult) => {
						expect(existResult).equal(false);
					});
				});
		});
	});

	const makeMigration = (params) => {
		const migration = {};
		migration.name = '9999_test';

		migration.migrate = (client, done) => {
			done();
		};
		migration.rollback = (client, done) => {
			done();
		};

		return _(migration).extend(params);
	};

	const validateMigrationAndCheckError = (migration, errorMessage) => {
		return Promise.resolve()
			.then(() => migrator.validateMigration(migration))
			.then((result) => {
				throw new Error(`Error expected, but got result: ${result}`);
			})
			.catch((err) => {
				expect(err).ok();
				expect(err).an(Error);
				expect(err.message).eql(errorMessage);
			});
	};

	let migration;

	describe('validate', () => {
		it('valid migration should be ok', () => {
			migration = makeMigration();

			return migrator.validateMigration(migration);
		});

		let errorMessage;
		it('non object migration should fail', () => {
			errorMessage = 'migration is not an object';

			return validateMigrationAndCheckError(1, errorMessage);
		});

		it('migration without migrate function should fail', () => {
			migration = makeMigration();
			delete migration.migrate;
			errorMessage = '`migrate` function is not set';

			return validateMigrationAndCheckError(migration, errorMessage);
		});

		it('migration with non function migrate should fail', () => {
			migration = makeMigration();
			migration.migrate = 1;
			errorMessage = '`migrate` is not a function';

			return validateMigrationAndCheckError(migration, errorMessage);
		});

		it('migration without rollback should be ok', () => {
			migration = makeMigration();
			delete migration.rollback;

			return migrator.validateMigration(migration);
		});

		it('migration with non function rollback should fail', () => {
			migration = makeMigration();
			migration.rollback = 1;
			errorMessage = '`rollback` set but it\'s not a function';

			return validateMigrationAndCheckError(migration, errorMessage);
		});

		it('migration with non array tags should fail', () => {
			migration = makeMigration();
			migration.tags = 1;
			errorMessage = '`tags` set but it\'s not an array';

			return validateMigrationAndCheckError(migration, errorMessage);
		});

		it('migration with tags array should be ok', () => {
			migration = makeMigration();
			migration.tags = ['one', 'two'];

			return migrator.validateMigration(migration);
		});
	});

	migration = makeMigration();
	['migrate', 'rollback'].forEach((action) => {
		describe(action, () => {
			it('good migration should be ok', () => migrator[action](migration));

			it('migration which produce eror should pass it', () => {
				migration[action] = () => {
					throw new Error(`Test ${action} error`);
				};

				return Promise.resolve()
					.then(() => migrator[action](migration))
					.then((result) => {
						throw new Error(`Error expected, but got result: ${result}`);
					})
					.catch((err) => {
						expect(err).ok();
						expect(err).an(Error);
						expect(err.message).equal(
							`Error during ${action} "${migration.name
							}": Test ${action} error`
						);
					});
			});
		});
	});

	describe('filter', () => {
		const migrationNamesHash = {
			one: makeMigration({name: 'one', tags: ['one']}),
			two: makeMigration({name: 'two', tags: ['one', 'two']}),
			three: makeMigration({name: 'three', tags: []}),
			four: makeMigration()
		};

		describe('by tag', () => {
			let loadMigration;
			before(() => {
				loadMigration = Migrator.prototype.loadMigration;

				Migrator.prototype.loadMigration = (name) => {
					return Promise.resolve(migrationNamesHash[name]);
				};
			});

			after(() => {
				Migrator.prototype.loadMigration = loadMigration;
			});

			it('with wrong tag expression, should fail', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'one *'
						});
					})
					.then((result) => {
						throw new Error(`Error expected, but got result: ${result}`);
					})
					.catch((err) => {
						expect(err).ok();
						expect(err.message).contain('unexpected token "*"');
					});
			});

			it('with tag one, should get proper migrations', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'one'
						});
					})
					.then((result) => {
						expect(result).eql({names: ['one', 'two']});
					});
			});

			it('with tag two, should get proper migrations', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'two'
						});
					})
					.then((result) => {
						expect(result).eql({names: ['two']});
					});
			});

			it('with tag with no migrations, should get nothing', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'three'
						});
					})
					.then((result) => {
						expect(result).eql({names: []});
					});
			});

			it('with tag one or two, should get proper migrations', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'one | two'
						});
					})
					.then((result) => {
						expect(result).eql({names: ['one', 'two']});
					});
			});

			it('with tag one and two, should get proper migrations', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: 'one & two'
						});
					})
					.then((result) => {
						expect(result).eql({names: ['two']});
					});
			});

			it('with tag not two, should get proper migrations', () => {
				return Promise.resolve()
					.then(() => {
						return migrator.filterMigrationNames({
							by: 'tag',
							names: _(migrationNamesHash).keys(),
							tag: '!two'
						});
					})
					.then((result) => {
						expect(result).eql({names: ['one', 'three', '9999_test']});
					});
			});
		});
	});
});

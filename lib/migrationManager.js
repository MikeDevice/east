'use strict';

const EventEmitter = require('events');
const inherits = require('util').inherits;
const _ = require('underscore');
const pProps = require('p-props');
const pMap = require('p-map');
const pEachSeries = require('p-each-series');
const Migrator = require('./migrator');

function MigrationManager() {
	this.migrator = new Migrator();

	// TODO: allow to pass params
	this._initLogger({});
}

inherits(MigrationManager, EventEmitter);

MigrationManager.prototype._initLogger = function _initLogger(params) {
	const logger = _({}).extend(console);

	logger.debug = params.trace ? logger.log : _.noop;

	if (params.silent) {
		logger.log = _.noop;
	}

	this.logger = logger;
};

MigrationManager.prototype.configure = function configure(params) {
	// FIXME: call init logger once
	this._initLogger(params);

	return this.migrator.configure(params);
};

MigrationManager.prototype.connect = function connect() {
	return this.migrator.connect();
};

MigrationManager.prototype.disconnect = function disconnect() {
	return this.migrator.disconnect();
};

MigrationManager.prototype._filterMigrationNames =
	function _filterMigrationNames(params) {
		return Promise.resolve()
			.then(() => {
				return this.migrator.filterMigrationNames({
					by: params.by,
					names: params.names,
					tag: params.tag
				});
			})
			.then((filterResult) => {
				return filterResult && filterResult.names;
			});
	};

MigrationManager.prototype._fallbackCommaSeparatedNames =
	function _fallbackCommaSeparatedNames(names) {
		const length = names.length;

		if (length === 1) {
			names = names[0].split(',');

			if (names.length > length) {
				this.logger.info(
					'DEPRECATION WARNING: target migrations separated by comma will ' +
					'not be supported in future versions (use space instead)'
				);
			}
		}

		return names;
	};

MigrationManager.prototype.getMigrationNames =
	function getMigrationNames(params) {
		return Promise.resolve()
			.then(() => {
				if (params.migrations && params.status) {
					throw new Error(
						'`status` option cannot be used when particular ' +
						'migrations are specified'
					);
				}

				if (params.migrations) {
					const migrations = this._fallbackCommaSeparatedNames(
						params.migrations
					);

					return this.migrator.normalizeNames(migrations);
				} else {
					const status = params.status || 'all';

					return this.migrator.getMigrationNames(status);
				}
			})
			.then((names) => {
				if (params.tag) {
					return this._filterMigrationNames({
						by: 'tag',
						tag: params.tag,
						names
					});
				} else {
					return names;
				}
			})
			.then((names) => {
				if (params.reverseOrder) {
					return names.reverse();
				} else {
					return names;
				}
			});
	};

MigrationManager.prototype._validateMigrationNames =
	function _validateMigrationNames(names) {
		return Promise.resolve()
			.then(() => {
				return pProps({
					checkMigrationsExistsResult: (
						this.migrator.checkMigrationsExists(names)
					),
					names
				});
			})
			.then((result) => result.names);
	};

MigrationManager.prototype._migrate = function _migrate(migration) {
	return Promise.resolve()
		.then(() => {
			this.emit('beforeMigrateOne', {
				migration: _(migration).pick('name', 'force')
			});

			return this.migrator.migrate(migration);
		})
		.then(() => {
			this.emit('afterMigrateOne', {
				migration: _(migration).pick('name', 'force')
			});
		});
};

MigrationManager.prototype.migrate = function migrate(params) {
	let migrationNames;

	return Promise.resolve()
		.then(() => {
			let getParams;

			if (params.migrations) {
				getParams = _(params).pick('migrations', 'status', 'tag');
			} else {
				getParams = _(params).pick('status', 'tag');

				if (!getParams.status) {
					getParams.status = 'new';
				}
			}

			return this.getMigrationNames(getParams);
		})
		.then((names) => this._validateMigrationNames(names))
		.then((names) => {
			const promisesObject = {
				separated: this.migrator.separateNames(names)
			};

			if (params.force) {
				delete promisesObject.separated;
				promisesObject.names = names;
			}

			return pProps(promisesObject);
		})
		.then((result) => {
			if (result.separated) {
				this.emit('onSeparatedMigrateNames', {
					executedMigrationNames: result.separated.executedNames,
					newMigrationNames: result.separated.newNames
				});

				return result.separated.newNames;
			} else {
				return result.names;
			}
		})
		.then((names) => {
			migrationNames = _(names).isEmpty() ? [] : names;

			this.emit('beforeMigrateMany', {migrationNames});

			if (!_(names).isEmpty()) {
				// TODO: move concurrency to vars
				return pMap(names, (name) => {
					return this.migrator.loadMigration(name);
				}, {concurrency: 10});
			}
		})
		.then((migrations) => {
			if (migrations) {
				return pEachSeries(migrations, (migration) => {
					migration.force = params.force;

					return this._migrate(migration);
				});
			}
		})
		.then(() => {
			this.emit('afterMigrateMany', {migrationNames});
		});
};

MigrationManager.prototype._rollback = function _rollback(migration) {
	return Promise.resolve()
		.then(() => {
			if (migration.rollback) {
				this.logger.log(`Rollback "${migration.name}"`);

				return this.migrator.rollback(migration);
			} else {
				this.logger.log(
					`Skip "${migration.name}" because rollback function is not set`
				);
			}
		})
		.then(() => {
			if (migration.rollback) {
				this.logger.log('Migration successfully rolled back');
			}
		});
};

MigrationManager.prototype.rollback = function rollback(params) {
	return Promise.resolve()
		.then(() => {
			let getParams;

			if (params.migrations) {
				getParams = _(params).pick('migrations', 'status', 'tag');
			} else {
				getParams = _(params).pick('status', 'tag');

				if (!getParams.status) {
					getParams.status = 'executed';
					getParams.reverseOrder = true;
				}
			}

			return this.getMigrationNames(getParams);
		})
		.then((names) => this._validateMigrationNames(names))
		.then((names) => {
			const promisesObject = {
				separated: this.migrator.separateNames(names)
			};

			if (params.force) {
				delete promisesObject.separated;
				promisesObject.names = names;
			}

			return pProps(promisesObject);
		})
		.then((result) => {
			if (result.separated) {
				_(result.separated.newNames).each((name) => {
					this.logger.log(`Skip "${name}" because it's not executed yet`);
				});

				return result.separated.executedNames;
			} else {
				return result.names;
			}
		})
		.then((names) => {
			if (_(names).isEmpty()) {
				this.logger.info('Nothing to rollback');

				return null;
			}

			this.logger.log(`Target migrations:\n\t${names.join('\n\t')}`);

			// TODO: move concurrency to vars
			return pMap(names, (name) => {
				return this.migrator.loadMigration(name);
			}, {concurrency: 10});
		})
		.then((migrations) => {
			if (migrations) {
				return pEachSeries(migrations, (migration) => {
					migration.force = params.force;

					return this._rollback(migration);
				});
			}
		});
};

MigrationManager.prototype.getParams = function getParams() {
	return Promise.resolve(this.migrator.params);
};

MigrationManager.prototype.isMigrationsDirExist =
	function isMigrationsDirExist() {
		return this.migrator.isDirExists();
	};

module.exports = MigrationManager;
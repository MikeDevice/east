'use strict';

const fse = require('fs-extra');
const pProps = require('p-props');

module.exports = function create(baseName) {
	return Promise.resolve()
		.then(() => {
			return this._getNextNumber();
		})
		.then((num) => {
			const name = `${num}_${baseName}`;
			const path = this.getMigrationPathByName(name);

			return pProps({
				name,
				copyResult: fse.copy(this.params.template, path)
			});
		})
		.then((result) => result.name);
};

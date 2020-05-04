const migrationsDirRegExp = new RegExp(
	'/.+?/migrations',
	'g'
);
const migrationTemplateRegExp = new RegExp(
	'/.+/migrationTemplate.js',
	'g'
);
const eastStackTraceRegExp = new RegExp(
	'^.*at \\(?.*/east/.*(([\\r\\n])+ {4}at .*)*',
	'gm'
);

module.exports = (data) => {
	return (
		data.replace(migrationsDirRegExp, '[Migrations dir]')
			.replace(migrationTemplateRegExp, '[Migration template]')
			.replace(eastStackTraceRegExp, '[East source stack trace]')
	);
};

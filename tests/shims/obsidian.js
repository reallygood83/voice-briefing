class Notice {
	constructor(message) {
		this.message = message;
	}
}

module.exports = {
	Platform: { isDesktop: true },
	Notice,
	requestUrl: async () => {
		throw new Error('requestUrl must be mocked in tests');
	}
};

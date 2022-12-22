import {ErrorMapperBuilder} from '@src/ErrorMapperBuilder';
import * as boom from '@hapi/boom';
import * as sinon from 'sinon';

describe('ErrorMapperBuilder', () => {
	describe('forwarding "code"', () => {
		const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: true}).get();
		it('forward "code" if available', () => {
			const error = new Error('message');
			(error as any).code = 'TEST';

			expect(mapper(error))
				.toHaveProperty('payload.code', 'TEST');
		});

		it('does not forward code if not available', () => {
			const error = new Error('message');

			expect(mapper(error))
				.not.toHaveProperty('payload.code');
		});

		it('forward "code" from boom "data"', () => {
			expect(mapper(boom.notFound('not found', {code: 'TEST'})))
				.toHaveProperty('payload.code', 'TEST');
		});
	});

	describe('forwarding "stack"', () => {
		it('forward if enabled and "stack" is available', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: true, showUnknownErrorMessage: false}).get();
			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('payload.stack', error.stack);
		})

		it('does not forward if enabled and "stack" is not available', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: true, showUnknownErrorMessage: false}).get();
			const error = {not: 'an error'} as any;
			expect(mapper(error))
				.not.toHaveProperty('payload.stack');
		});

		it('does not forward if disabled and "stack" is available', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false}).get();
			const error = new Error('test');
			expect(mapper(error))
				.not.toHaveProperty('payload.stack');
		});
	});

	describe('showing critical error', () => {
		it('showing if enabled and it is an unknown error', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: true}).get();
			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('payload.message', error.message);
		});

		it('not showing if enabled and it is not an unknown error', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: true})
				.registerErrorMapper(() => {
					return boom.notFound();
				})
				.get();

			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('payload.message', 'Not Found');
		});

		it('not showing if disabled', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false}).get();
			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('payload.message', 'Internal server error. Please try again later.');
		});

		it('properly shows message of errors that are not unknown', () => {
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false})
				.registerErrorMapper(() => {
					return boom.notFound();
				})
				.get();

			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('payload.message', 'Not Found');
		});
	});

	describe('mapping error', () => {
		it('no mappers are called if error is already "boom" error', () => {
			const errorMapper = sinon.stub();
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: true})
				.registerErrorMapper(errorMapper)
				.get();

			expect(mapper(boom.notFound()))
				.toHaveProperty('payload.message', 'Not Found');
			sinon.assert.notCalled(errorMapper);
		});

		it('stops on first mapper that returns boom error', () => {
			const errorMapper1 = sinon.stub();
			const errorMapper2 = sinon.stub().callsFake(() => boom.notFound());
			const errorMapper3 = sinon.stub();

			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: true})
				.registerErrorMapper(errorMapper1)
				.registerErrorMapper(errorMapper2)
				.registerErrorMapper(errorMapper3)
				.get();

			const error = new Error('test')
			expect(mapper(error))
				.toHaveProperty('payload.message', 'Not Found');
			sinon.assert.calledOnce(errorMapper1);
			sinon.assert.calledOnce(errorMapper2);
			sinon.assert.notCalled(errorMapper3);
		});
	});

	describe('unknown error listeners', () => {
		it('called on unknown errors', () => {
			const spy1 = sinon.spy();
			const spy2 = sinon.spy();

			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false})
				.onUnknownError(spy1)
				.onUnknownError(spy2)
				.get();

			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('statusCode', 500);

			sinon.assert.calledWith(spy1, error);
			sinon.assert.calledWith(spy2, error);
		});

		it('not called on known errors', () => {
			const spy1 = sinon.spy();
			const spy2 = sinon.spy();

			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false})
				.registerErrorMapper(() => boom.notFound())
				.onUnknownError(spy1)
				.onUnknownError(spy2)
				.get();

			expect(mapper(new Error('test')))
				.toHaveProperty('statusCode', 404);

			sinon.assert.notCalled(spy1);
			sinon.assert.notCalled(spy2);
		});
	});

	describe('output formatters', () => {
		it('output formatter is called with a regular error and boomed error if regular error gets provided', () => {
			const formatter = sinon.stub().callsFake((output) => ({...output, fake: 1}));

			const boomedError = boom.notFound()
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false})
				.registerErrorMapper(() => boomedError)
				.registerOutputTransformer(formatter)
				.get();

			const error = new Error('test');
			expect(mapper(error))
				.toHaveProperty('fake', 1);

			sinon.assert.calledWith(
				formatter,
				boomedError.output,
				error,
				boomedError
			);
		});

		it('output formatter is called with a boom error if boom error gets provided', () => {
			const formatter = sinon.stub().callsFake((output) => ({...output, fake: 1}));

			const boomedError = boom.notFound()
			const mapper = new ErrorMapperBuilder({showStackTrace: false, showUnknownErrorMessage: false})
				.registerErrorMapper(() => boomedError)
				.registerOutputTransformer(formatter)
				.get();

			const error = boom.badGateway();
			expect(mapper(error))
				.toHaveProperty('fake', 1);

			sinon.assert.calledWith(
				formatter,
				error.output,
				error,
				error
			);
		});
	});
});

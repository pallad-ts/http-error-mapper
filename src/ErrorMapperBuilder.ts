import {Builder} from '@pallad/builder';
import {isDevelopment, isTest} from '@pallad/app-env';
import * as boom from '@hapi/boom';
import {ErrorOutput} from './ErrorOutput';

export class ErrorMapperBuilder extends Builder {
	private errorMappers: ErrorMapperBuilder.ErrorMapper[] = [];
	private onUnknownErrorListeners: ErrorMapperBuilder.UnknownErrorListener[] = [];
	private outputTransformers: ErrorMapperBuilder.OutputTransformer[] = [];

	constructor(private options: ErrorMapperBuilder.Options) {
		super();

		this.runIf(this.options.showStackTrace, () => {
			this.registerOutputTransformer((output, error) => {
				if (error && error instanceof Error && 'stack' in error) {
					return {
						...output,
						payload: {
							...output.payload,
							stack: error.stack
						}
					};
				}

				return output;
			});
		});

		this.registerOutputTransformer((output, error) => {
			const code = boom.isBoom(error) ? error.data?.code : (error as any).code;
			if (code) {
				return {
					...output,
					payload: {
						...output.payload,
						code
					}
				};
			}
			return output;
		});

		this.runIf(!this.options.showUnknownErrorMessage, () => {
			this.registerOutputTransformer((output, error, boomedError) => {
				if (boomedError && boomedError.output.statusCode === 500) {
					return {
						...output,
						payload: {
							...output.payload,
							message: 'Internal server error. Please try again later.'
						}
					};
				}
				return output;
			});
		})
	}

	static fromEnv() {
		return new ErrorMapperBuilder({
			showStackTrace: isDevelopment || isTest,
			showUnknownErrorMessage: isDevelopment || isTest
		});
	}

	onUnknownError(listener: ErrorMapperBuilder.UnknownErrorListener) {
		this.onUnknownErrorListeners.push(listener);
		return this;
	}

	registerErrorMapper<T extends Error>(mapper: ErrorMapperBuilder.ErrorMapper): this {
		this.errorMappers.push(mapper);
		return this;
	}

	registerOutputTransformer(outputTransformer: ErrorMapperBuilder.OutputTransformer) {
		this.outputTransformers.push(outputTransformer);
		return this;
	}

	get(): ErrorMapperBuilder.Mapper {
		const mapToBoom = (err: unknown) => {
			if (boom.isBoom(err)) {
				return err;
			}

			for (const errorMapper of this.errorMappers) {
				const mappingResult = errorMapper(err);
				if (mappingResult) {
					return mappingResult;
				}
			}

			for (const onUnknownErrorListener of this.onUnknownErrorListeners) {
				onUnknownErrorListener(err);
			}
			const internal = boom.internal(err instanceof Error ? err.message : String(err))
			internal.reformat(true);
			return internal;
		}

		return (err: unknown) => {
			const boomedError = mapToBoom(err);

			return this.outputTransformers.reduce<ErrorOutput>(
				(output, transformer) => {
					return transformer(output, err, boomedError);
				},
				boomedError.output
			);
		}
	}
}

export namespace ErrorMapperBuilder {
	export interface Options {
		/**
		 * Whether to include stack trace in every error
		 */
		showStackTrace: boolean;

		/**
		 * Whether to show message of critical error
		 */
		showUnknownErrorMessage: boolean;
	}

	export interface ErrorMapper {
		(error: unknown): boom.Boom | undefined;
	}

	export interface UnknownErrorListener {
		(error: unknown): void;
	}

	export interface OutputTransformer {
		(output: ErrorOutput, error: unknown, boomedError?: boom.Boom): ErrorOutput;
	}

	export interface Mapper {
		(error: unknown): ErrorOutput;
	}
}

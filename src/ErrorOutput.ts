export interface ErrorOutput {
	statusCode: number;
	payload: ErrorOutput.Payload;
	headers?: { [header: string]: string | string[] | number | undefined }
}

export namespace ErrorOutput {
	export interface Payload {
		message: string;
		code?: string;
		name?: string;
		stack?: string;

		[extraProperty: string]: any;
	}
}

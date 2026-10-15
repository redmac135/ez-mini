import { ApiError } from '../http/errors.ts';
import { supabaseAuth } from '../supabase/client.ts';
import type { Env, SupabaseIdentity } from '../types.ts';

export class IdentityUnlinkCoordinator {
	private readonly state: DurableObjectState;
	private readonly env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request) {
		let response: Response = Response.json(
			{ error: 'Unable to disconnect this account.' },
			{ status: 502 }
		);
		await this.state.blockConcurrencyWhile(async () => {
			try {
				const body = (await request.json()) as {
					identityId?: unknown;
					accessToken?: unknown;
				};
				const identityId = typeof body.identityId === 'string' ? body.identityId : '';
				const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
				if (!identityId || !accessToken)
					throw new ApiError(400, 'Identity and session are required.');

				const user = await supabaseAuth<{ identities?: SupabaseIdentity[] }>(this.env, '/user', {
					method: 'GET',
					accessToken
				});
				const identities = user.identities ?? [];
				if (!identities.some((identity) => identity.identity_id === identityId)) {
					throw new ApiError(404, 'Connected identity not found.');
				}
				if (identities.length < 2) {
					throw new ApiError(409, 'At least one sign-in method must remain connected.');
				}
				await supabaseAuth(this.env, `/user/identities/${encodeURIComponent(identityId)}`, {
					method: 'DELETE',
					accessToken
				});
				response = Response.json({ unlinked: true });
			} catch (error) {
				const status = error instanceof ApiError ? error.status : 502;
				const message =
					error instanceof Error ? error.message : 'Unable to disconnect this account.';
				response = Response.json({ error: message }, { status });
			}
		});
		return response;
	}
}

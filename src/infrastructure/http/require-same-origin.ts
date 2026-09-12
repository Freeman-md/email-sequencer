import 'server-only';
import { appOrigin } from '../config/env';

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== appOrigin()) {
    throw new Error(
      'Request origin is not allowed. Open the app at the configured OAuth host.',
    );
  }
}

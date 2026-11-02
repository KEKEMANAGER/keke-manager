// booking-import — entry point. The work is in handler.ts and the modules it
// imports; this file only serves it, so tests can import the handler directly.
import { handler } from './handler.ts';

Deno.serve(handler);

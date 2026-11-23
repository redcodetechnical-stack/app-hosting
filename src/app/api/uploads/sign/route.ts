import { z } from 'zod';
import { route } from '@/lib/http';
import { cloudinaryUploadSignature } from '@/lib/external';

/** Signed direct upload (prescriptions, reports, community images). Files go straight to Cloudinary, never through this server. */
export const POST = route({ body: z.object({ purpose: z.enum(['appointment_document', 'community_image', 'avatar']) }), rate: [30, 3600] }, async ({ user, body }) =>
  cloudinaryUploadSignature(`vitalora/${body.purpose}/${user.id}`));

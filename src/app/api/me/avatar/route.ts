import { route } from '@/lib/http';
import { cloudinaryUploadSignature } from '@/lib/external';

/** Returns signed parameters; the app uploads the image straight to Cloudinary, then PATCHes /api/me/profile { avatarUrl }. */
export const POST = route({ rate: [20, 3600] }, async ({ user }) => cloudinaryUploadSignature(`vitalora/avatars`, user.id));

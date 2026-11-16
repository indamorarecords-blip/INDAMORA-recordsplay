import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

export function getSubmissionOwnerFolder(
  userId: string
): string {
  return createHash('sha256')
    .update(userId)
    .digest('hex')
    .slice(0, 32);
}

export function isSubmissionOwnedByUser(
  objectPath: string,
  userId: string
): boolean {
  const expectedPrefix =
    `submissions/${getSubmissionOwnerFolder(userId)}/`;

  return objectPath.startsWith(expectedPrefix);
}

export function isValidSubmissionPath(
  objectPath: string
): boolean {
  if (!objectPath || objectPath.length > 1000) {
    return false;
  }

  if (objectPath.includes('..') || objectPath.startsWith('/')) {
    return false;
  }

  return /^submissions\/[a-f0-9]{32}\/[a-f0-9-]{36}\.[a-z0-9]+$/i.test(
    objectPath
  );
}

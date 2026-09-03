export function logSafeError(context, error) {
    const details = [];

    if (Number.isInteger(error?.status)) {
        details.push(`status=${error.status}`);
    }

    if (error?.code) {
        details.push(`code=${error.code}`);
    }

    const suffix = details.length > 0
        ? ` (${details.join(', ')})`
        : '';

    console.error(`❌ ${context}${suffix}`);
}

function requireSettingsRepository(settingsRepository) {
    if (!settingsRepository
        || typeof settingsRepository.list !== 'function'
        || typeof settingsRepository.set !== 'function') {
        throw new Error('Settings use cases require a settings repository');
    }

    return settingsRepository;
}

export function createSettingsUseCases({ settingsRepository }) {
    const repository = requireSettingsRepository(settingsRepository);

    return {
        list(userId) {
            return repository.list(userId);
        },

        set(key, value, userId) {
            return repository.set(key, value, userId);
        }
    };
}

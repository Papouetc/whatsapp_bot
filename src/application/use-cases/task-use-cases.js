function requireTaskRepository(taskRepository) {
    if (!taskRepository
        || typeof taskRepository.listPending !== 'function'
        || typeof taskRepository.complete !== 'function') {
        throw new Error('Task use cases require a task repository');
    }

    return taskRepository;
}

export function createTaskUseCases({ taskRepository }) {
    const repository = requireTaskRepository(taskRepository);

    return {
        listPending(userId) {
            return repository.listPending(userId);
        },

        complete(taskId, userId) {
            return repository.complete(taskId, userId);
        }
    };
}

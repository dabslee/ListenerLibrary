function showToast(message, status = 'success') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const toastId = 'toast-' + Date.now();
    let toastIcon;
    let toastHeaderClass;

    switch (status) {
        case 'success':
            toastIcon = 'fa-check-circle';
            toastHeaderClass = 'bg-success';
            break;
        case 'warning':
            toastIcon = 'fa-exclamation-triangle';
            toastHeaderClass = 'bg-warning';
            break;
        case 'error':
        default:
            toastIcon = 'fa-times-circle';
            toastHeaderClass = 'bg-danger';
            break;
    }

    const toastHTML = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000">
            <div class="toast-header ${toastHeaderClass} text-white">
                <i class="fas ${toastIcon} me-2"></i>
                <strong class="me-auto">Notification</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}
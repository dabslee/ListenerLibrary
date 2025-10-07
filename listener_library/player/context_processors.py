from .models import Profile

def theme_processor(request):
    if request.user.is_authenticated:
        profile, created = Profile.objects.get_or_create(user=request.user)
        return {'theme': profile}
    return {}
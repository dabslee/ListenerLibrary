from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import UserProfile, Track, UserPlaybackState, PodcastProgress, Bookmark
from django.core.exceptions import ValidationError
from django.conf import settings
from django.db.models import Sum


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'profile'


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)

    def save_model(self, request, obj, form, change):
        # This method is called when a user is saved from the admin.
        super().save_model(request, obj, form, change)

        # We need to get the storage limit from the form data because the obj.userprofile might not be updated yet
        storage_limit_gb = form.cleaned_data.get('storage_limit_gb', settings.DEFAULT_USER_STORAGE_LIMIT_GB)

        # Exclude current user's profile from the total calculation if it exists
        user_profiles = UserProfile.objects.exclude(user=obj)
        total_storage = user_profiles.aggregate(Sum('storage_limit_gb'))['storage_limit_gb__sum'] or 0

        if total_storage + storage_limit_gb > settings.STORAGE_LIMIT_GB_TOTAL:
            raise ValidationError(f"Cannot save user, total storage limit would exceed the system limit of {settings.STORAGE_LIMIT_GB_TOTAL} GB.")


# Re-register UserAdmin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

admin.site.register(Track)
admin.site.register(UserPlaybackState)
admin.site.register(PodcastProgress)
admin.site.register(Bookmark)
admin.site.register(UserProfile)

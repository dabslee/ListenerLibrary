from django import template

register = template.Library()

@register.filter
def format_duration(seconds):
    if seconds is None or not isinstance(seconds, (int, float)):
        return "0:00"
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    return f"{minutes}:{seconds:02d}"
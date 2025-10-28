from django import template

register = template.Library()

@register.filter
def format_duration(seconds):
    if seconds is None:
        return "0:00"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    seconds = seconds % 60
    if hours > 0:
        return f'{hours}:{minutes:02}:{seconds:02}'
    return f'{minutes}:{seconds:02}'

@register.filter
def format_bytes(value):
    if value is None:
        return "0 B"
    if value < 1024:
        return f"{value} B"
    elif value < 1024**2:
        return f"{value/1024:.2f} KB"
    elif value < 1024**3:
        return f"{value/1024**2:.2f} MB"
    else:
        return f"{value/1024**3:.2f} GB"

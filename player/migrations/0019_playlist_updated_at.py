import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("player", "0018_podcastprogress_recorded_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="playlist",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]

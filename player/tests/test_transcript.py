from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from player.models import Track, Transcript
import time

class TranscriptTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client = Client()
        self.client.force_login(self.user)

        # Create a dummy track
        self.track = Track.objects.create(
            name='Test Track',
            owner=self.user,
            type='song',
            duration=100
        )
        self.track.file.save('test.mp3', SimpleUploadedFile('test.mp3', b'dummy content'))

    def test_transcript_request(self):
        response = self.client.post(f'/track/{self.track.id}/transcript/', {'action': 'request'})
        self.assertEqual(response.status_code, 302)

        transcript = Transcript.objects.get(track=self.track)
        self.assertEqual(transcript.status, 'pending')

    def test_srt_upload(self):
        srt_content = b"1\n00:00:01,000 --> 00:00:02,000\nHello World"
        srt_file = SimpleUploadedFile('test.srt', srt_content)

        response = self.client.post(f'/track/{self.track.id}/transcript/', {
            'action': 'upload',
            'source_file': srt_file
        })
        self.assertEqual(response.status_code, 302)

        transcript = Transcript.objects.get(track=self.track)
        self.assertEqual(transcript.status, 'completed')
        self.assertIn("Hello World", transcript.content)

    def test_txt_upload(self):
        txt_file = SimpleUploadedFile('test.txt', b"Just some text")

        response = self.client.post(f'/track/{self.track.id}/transcript/', {
            'action': 'upload',
            'source_file': txt_file
        })

        transcript = Transcript.objects.get(track=self.track)
        self.assertEqual(transcript.status, 'pending') # Should queue for alignment/processing
        self.assertTrue(transcript.source_file)

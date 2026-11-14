# Three views of a synthetic face

The three JPEGs show a single textured mesh rendered in Three.js. The body surface is derived from **BodyParts3D**, © The Database Center for Life Science, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The front of the mesh was reshaped and textured from the project's [fictional sample portrait](../SAMPLE.md). The derived renderings are provided under CC BY 4.0. They contain no webcam frames from a user or team member.

To reproduce, run the development server, open `/scripts/render-multiview.html`, and save the three rendered JPEGs from that page. The mesh, lens and lighting stay fixed while the subject turns from 0° to +28° and −28°. The page independently detects each rendered image using the local MediaPipe model. The studio then decodes the saved JPEGs again and uses its regular three-angle fitting pipeline.

These images check registration, texture sampling and the review/apply flow; they are not human validation data or a measurement of real-world scan accuracy.

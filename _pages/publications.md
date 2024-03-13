---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---
**Wang, S.**, Wong, L. L. N., & Chen, Y. (2024). Development of the mandarin reading span test and confirmation of its relationship with speech perception in noise. International journal of audiology, 1–10. Advance online publication. [https://doi.org/10.1080/14992027.2024.2305685](https://doi.org/10.1080/14992027.2024.2305685)

**Wang S**, Mo C, Chen Y, Dai X, Wang H, Shen X (2004). Exploring the Performance of ChatGPT-4 in Taiwan Audiologist Examination: Indicating the Potential of AI Chatbots in Hearing Care (Preprint). JMIR Preprints. 18/12/2023:55595. DOI: 10.2196/preprints.55595 URL: https://preprints.jmir.org/preprint/55595

**Wang, S.** (2023). Development and Validation of a Mandarin Digit-In-Noise Test for Screening Hearing and Cognitive Function. (Thesis). University of Hong Kong, Pokfulam, Hong Kong SAR.

**Wang, S.**, & Wong, L. L. N. (2023). Development of the Mandarin Digit-in-Noise Test and Examination of the Effect of the Number of Digits Used in the Test. Ear and hearing, 10.1097/AUD.0000000000001447. Advance online publication. https://doi.org/10.1097/AUD.0000000000001447

Chen, Y., Wong, L. L. N., Kuehnel, V., Qian, J., Voss, S. C., & **Shangqiguo, W.** (2021). Can dual compression offer better Mandarin speech intelligibility and sound quality than fast-acting compression? Trends in Hearing, 25. https://doi.org/10.1177/2331216521997610

Monaghan, J. J. M., Goehring, T., Yang, X., Bolner, F., **Wang, S.**, Wright, M. C. M., & Bleeck, S. (2017). Auditory inspired machine learning techniques can improve speech intelligibility and quality for hearing-impaired listeners. The Journal of the Acoustical Society of America, 141(3), 1985–1998. https://doi.org/10.1121/1.4977197

{% if author.googlescholar %}
  You can also find my articles on <u><a href="{{author.googlescholar}}">my Google Scholar profile</a>.</u>
{% endif %}

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}

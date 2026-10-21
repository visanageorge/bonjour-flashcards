"""Present indicative authored/reviewed for this catalog; no model/API calls."""
import re

SECOND_GROUP = set('agir applaudir atterrir avertir choisir finir fournir garantir grandir guérir investir remplir réfléchir réussir rôtir saisir vieillir élargir établir'.split())
GRAVE_E = set('acheter lever enlever emmener promener'.split())
GRAVE_ACCENT = set('préférer espérer exagérer gérer répéter régler posséder récupérer inquiéter protéger'.split())
IRREGULAR = {
 'être':'suis es est sommes êtes sont',
 'avoir':'ai as a avons avez ont',
 'aller':'vais vas va allons allez vont',
 'faire':'fais fais fait faisons faites font',
 'dire':'dis dis dit disons dites disent',
 'interdire':'interdis interdis interdit interdisons interdisez interdisent',
 'savoir':'sais sais sait savons savez savent',
 'vouloir':'veux veux veut voulons voulez veulent',
 'pouvoir':'peux peux peut pouvons pouvez peuvent',
 'devoir':'dois dois doit devons devez doivent',
 'prendre':'prends prends prend prenons prenez prennent',
 'mettre':'mets mets met mettons mettez mettent',
 'venir':'viens viens vient venons venez viennent',
 'tenir':'tiens tiens tient tenons tenez tiennent',
 'boire':'bois bois boit buvons buvez boivent',
 'voir':'vois vois voit voyons voyez voient',
 'croire':'crois crois croit croyons croyez croient',
 'recevoir':'reçois reçois reçoit recevons recevez reçoivent',
 'apercevoir':'aperçois aperçois aperçoit apercevons apercevez aperçoivent',
 'lire':'lis lis lit lisons lisez lisent',
 'écrire':'écris écris écrit écrivons écrivez écrivent',
 'décrire':'décris décris décrit décrivons décrivez décrivent',
 'vivre':'vis vis vit vivons vivez vivent',
 'suivre':'suis suis suit suivons suivez suivent',
 'courir':'cours cours court courons courez courent',
 'mourir':'meurs meurs meurt mourons mourez meurent',
 'dormir':'dors dors dort dormons dormez dorment',
 'partir':'pars pars part partons partez partent',
 'sortir':'sors sors sort sortons sortez sortent',
 'sentir':'sens sens sent sentons sentez sentent',
 'servir':'sers sers sert servons servez servent',
 'mentir':'mens mens ment mentons mentez mentent',
 'ouvrir':'ouvre ouvres ouvre ouvrons ouvrez ouvrent',
 'couvrir':'couvre couvres couvre couvrons couvrez couvrent',
 'découvrir':'découvre découvres découvre découvrons découvrez découvrent',
 'offrir':'offre offres offre offrons offrez offrent',
 'souffrir':'souffre souffres souffre souffrons souffrez souffrent',
 'accueillir':'accueille accueilles accueille accueillons accueillez accueillent',
 'bouillir':'bous bous bout bouillons bouillez bouillent',
 'asseoir':'assieds assieds assied asseyons asseyez asseyent',
 'connaître':'connais connais connaît connaissons connaissez connaissent',
 'disparaître':'disparais disparais disparaît disparaissons disparaissez disparaissent',
 'naître':'nais nais naît naissons naissez naissent',
 'plaire':'plais plais plaît plaisons plaisez plaisent',
 'valoir':'vaux vaux vaut valons valez valent',
 'peindre':'peins peins peint peignons peignez peignent',
 'plaindre':'plains plains plaint plaignons plaignez plaignent',
 'craindre':'crains crains craint craignons craignez craignent',
 'éteindre':'éteins éteins éteint éteignons éteignez éteignent',
 'joindre':'joins joins joint joignons joignez joignent',
 'convaincre':'convaincs convaincs convainc convainquons convainquez convainquent',
 'résoudre':'résous résous résout résolvons résolvez résolvent',
}
DERIVED = {
 'apprendre':('ap','prendre'), 'comprendre':('com','prendre'),
 'reprendre':('re','prendre'), 'surprendre':('sur','prendre'),
 'promettre':('pro','mettre'), 'permettre':('per','mettre'),
 'devenir':('de','venir'), 'revenir':('re','venir'),
 'convenir':('con','venir'), 'prévenir':('pré','venir'),
 'souvenir':('sou','venir'), 'obtenir':('ob','tenir'),
 'endormir':('en','dormir'), 'repartir':('re','partir'),
 'défaire':('dé','faire'),
}
REGULAR_RE = set('attendre descendre défendre dépendre entendre perdre rendre répondre vendre'.split())
UIRE = set('conduire construire cuire introduire réduire traduire'.split())
VOWELS = set('aàâäeéèêëiîïoôöuùûüyœh')

def replace_last(value, old, new):
    position=value.rfind(old)
    assert position>=0, value
    return value[:position]+new+value[position+1:]

def forms(lemma):
    if lemma in IRREGULAR:
        return IRREGULAR[lemma].split()
    if lemma in DERIVED:
        prefix,base=DERIVED[lemma]
        return [prefix+form for form in forms(base)]
    if lemma in SECOND_GROUP:
        root=lemma[:-2]
        return [root+ending for ending in ('is','is','it','issons','issez','issent')]
    if lemma in REGULAR_RE:
        root=lemma[:-2]
        return [root+ending for ending in ('s','s','','ons','ez','ent')]
    if lemma in UIRE:
        root=lemma[:-2]
        return [root+ending for ending in ('s','s','t','sons','sez','sent')]
    if lemma.endswith('er'):
        root=lemma[:-2]
        stressed=root
        if lemma.endswith('yer'):
            stressed=root[:-1]+'i'
        if lemma in GRAVE_E:
            stressed=replace_last(root,'e','è')
        if lemma in GRAVE_ACCENT:
            stressed=replace_last(root,'é','è')
        if lemma in {'appeler','rappeler','jeter'}:
            stressed=root+root[-1]
        result=[stressed+'e',stressed+'es',stressed+'e',root+'ons',root+'ez',stressed+'ent']
        if lemma.endswith('ger'):
            result[3]=root+'eons'
        if lemma.endswith('cer'):
            result[3]=root[:-1]+'çons'
        return result
    raise ValueError('Unreviewed verb conjugation: '+lemma)

def conjugation_for_card(catalog_id, front, back):
    if catalog_id=='FR-01887' or not re.match(r'Traducere: a(?: |-)',back):
        return None
    text=re.sub(r'^ne pas ','',front)
    reflexive=bool(re.match(r"^(?:se |s[’'])",text))
    text=re.sub(r"^(?:se |s[’'])",'',text)
    lemma=text.split()[0]
    if lemma in {'falloir','pleuvoir','neiger'}:
        return f'Conjugare la prezent ({lemma}):\nil '+{'falloir':'faut','pleuvoir':'pleut','neiger':'neige'}[lemma]+'\nVerb impersonal în acest sens.'
    if lemma=='frire':
        # Académie française: https://www.dictionnaire-academie.fr/article/A9F1701
        return ('Conjugare la prezent (frire):\nje fris\ntu fris\nil/elle/on frit\n'
                'La plural se folosește faire frire:\nnous faisons frire\nvous faites frire\nils/elles font frire\n'
                'Verb defectiv; formele simple de plural nu sunt uzuale.')
    conjugated=forms(lemma)
    assert len(conjugated)==6
    subjects=['je','tu','il/elle/on','nous','vous','ils/elles']
    if reflexive:
        reflexives=['me','te','se','nous','vous','se']
        for i,word in enumerate(conjugated):
            pronoun=reflexives[i]
            conjugated[i]=(pronoun[:-1]+"'" if i in {0,1,2,5} and word[0] in VOWELS else pronoun+' ')+word
    lines=[]
    for i,word in enumerate(conjugated):
        prefix="j'" if i==0 and not reflexive and word[0] in VOWELS else subjects[i]+' '
        lines.append(prefix+word)
    title=(("s'" if lemma[0] in VOWELS else 'se ')+lemma) if reflexive else lemma
    return 'Conjugare la prezent ('+title+'):\n'+'\n'.join(lines)

def add_conjugation(catalog_id,front,back):
    conjugation=conjugation_for_card(catalog_id,front,back)
    if not conjugation:
        return back
    before,examples=back.split('\n\nExemple:',1)
    before=re.split(r'\n\n(?:Conjugare|Conjugaison)',before)[0]
    return before+'\n\n'+conjugation+'\n\nExemple:'+examples
